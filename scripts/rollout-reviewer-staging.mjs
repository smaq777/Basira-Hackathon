import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';

// Explicit staging targets only. No env files, startup migrations, credentials in
// output, production branches, role changes, resets or unchecked SQL rewrites.
const mode = process.argv[2];
const project = process.env.ROLLOUT_RAILWAY_PROJECT;
const api = process.env.ROLLOUT_RAILWAY_API;
const postgres = process.env.ROLLOUT_RAILWAY_POSTGRES;
const environment = process.env.ROLLOUT_RAILWAY_ENVIRONMENT;
const neonProject = process.env.ROLLOUT_NEON_PROJECT;
const neonBranch = process.env.ROLLOUT_NEON_BRANCH;
if (
  !['inspect', 'apply'].includes(mode) ||
  ![project, api, postgres, environment].every((id) => /^[a-f0-9-]{36}$/u.test(id ?? '')) ||
  !neonProject ||
  !/^br-[a-z0-9-]+$/u.test(neonBranch ?? '')
)
  throw new Error('EXPLICIT_STAGING_TARGETS_REQUIRED');

function command(args, input) {
  try {
    return execFileSync('npx', args, {
      input,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 2_000_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Provider stderr can contain connection details; never forward it.
    throw new Error('STAGING_PROVIDER_COMMAND_FAILED');
  }
}
const railway = ['--yes', '@railway/cli'];
const scope = ['-p', project, '-e', environment];
function variables(service) {
  const values = JSON.parse(command([...railway, 'variables', ...scope, '-s', service, '--json']));
  if (
    values.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    values.RAILWAY_ENVIRONMENT_ID !== environment ||
    values.RAILWAY_PROJECT_ID !== project ||
    values.RAILWAY_SERVICE_ID !== service
  )
    throw new Error('RAILWAY_STAGING_IDENTITY_MISMATCH');
  return values;
}
const apiVariables = variables(api);
const pgVariables = variables(postgres);
const database = pgVariables.PGDATABASE;
const ownerRole = pgVariables.PGUSER;
if (![database, ownerRole].every((name) => /^[a-z][a-z0-9_]{1,62}$/u.test(name ?? '')))
  throw new Error('REPORT_OWNER_TARGET_INVALID');
const reportUrl = new URL(apiVariables.DATABASE_URL);
if (
  decodeURIComponent(reportUrl.pathname.slice(1)) !== database ||
  reportUrl.hostname !== pgVariables.RAILWAY_PRIVATE_DOMAIN
)
  throw new Error('REPORT_DATABASE_BINDING_MISMATCH');
function report(sql) {
  return command(
    [
      ...railway,
      'ssh',
      ...scope,
      '-s',
      postgres,
      '--',
      'sh',
      '-lc',
      `psql -U ${ownerRole} -d ${database} -v ON_ERROR_STOP=1 -Atq`,
    ],
    sql,
  );
}
const metadata = JSON.parse(
  command(['neon', 'api', `/projects/${neonProject}/branches/${neonBranch}`, '-o', 'json']),
).branch;
if (
  metadata?.id !== neonBranch ||
  metadata.default ||
  metadata.primary ||
  metadata.protected ||
  !metadata.parent_id ||
  metadata.current_state !== 'ready'
)
  throw new Error('NEON_STAGING_CHILD_REQUIRED');
const corpusUrl = new URL(apiVariables.FOUNDATION_CORPUS_DATABASE_URL);
const ownerUrl = new URL(
  command([
    'neon',
    'connection-string',
    neonBranch,
    '--project-id',
    neonProject,
    '--role-name',
    'basirah_owner',
    '--database-name',
    decodeURIComponent(corpusUrl.pathname.slice(1)),
  ]),
);
if (
  ownerUrl.hostname !== corpusUrl.hostname.replace('-pooler.', '.') ||
  ownerUrl.hostname.includes('-pooler.') ||
  ownerUrl.pathname !== corpusUrl.pathname
)
  throw new Error('NEON_CORPUS_BINDING_MISMATCH');
ownerUrl.searchParams.delete('sslmode');
ownerUrl.searchParams.delete('channel_binding');
const corpus = new pg.Client({
  connectionString: ownerUrl.toString(),
  ssl: { rejectUnauthorized: true },
});
await corpus.connect();
try {
  const files = (await readdir('migrations'))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  const manifest = new Map();
  for (const file of files)
    manifest.set(
      file.replace(/\.sql$/u, ''),
      migrationChecksums(await readFile(`migrations/${file}`, 'utf8')),
    );
  const reportRows = JSON.parse(
    report(
      "select coalesce(json_agg(m order by version),'[]'::json) from basirah_private.schema_migration m;",
    ),
  );
  const corpusRows = (
    await corpus.query(
      'select version,checksum_sha256 from basirah_private.schema_migration order by version',
    )
  ).rows;
  const plan = (rows, minimum) => {
    for (const row of rows)
      if (!manifest.get(row.version)?.matchesRecorded(row.checksum_sha256))
        throw new Error(`STAGING_CHECKSUM_DRIFT_${row.version}`);
    const seen = new Set(rows.map((row) => row.version));
    const missing = [...manifest.keys()].filter((version) => !seen.has(version));
    if (missing.some((version) => Number(version.slice(0, 4)) < minimum))
      throw new Error('STAGING_SCHEMA_TOO_OLD_FOR_REHEARSED_PLAN');
    return missing;
  };
  const reportPlan = plan(reportRows, 15),
    corpusPlan = plan(corpusRows, 13);
  const original = (
    await corpus.query(
      "select count(*)::int as count, encode(public.digest(coalesce(string_agg(id::text||':'||encode(content_hash,'hex'),',' order by id),''),'sha256'),'hex') as digest from basirah.passage",
    )
  ).rows[0];
  if (mode === 'apply') {
    for (const [connection, versions] of [
      [report, reportPlan],
      [(sql) => corpus.query(sql), corpusPlan],
    ]) {
      for (const version of versions) {
        const migration = manifest.get(version);
        await connection(
          migration.canonicalSql.replace(
            "'0000000000000000000000000000000000000000000000000000000000000000'",
            `'${migration.canonicalChecksum}'`,
          ),
        );
      }
    }
    const after = (
      await corpus.query(
        "select count(*)::int as count, encode(public.digest(coalesce(string_agg(id::text||':'||encode(content_hash,'hex'),',' order by id),''),'sha256'),'hex') as digest from basirah.passage",
      )
    ).rows[0];
    if (after.count !== original.count || after.digest !== original.digest)
      throw new Error('EXISTING_CORPUS_IDENTITY_CHANGED');
  }
  console.log(
    JSON.stringify({
      mode,
      reportPlan,
      corpusPlan,
      existingCorpusPassages: original.count,
      readerLogin: decodeURIComponent(corpusUrl.username),
      curatorConfigured: !!apiVariables.REVIEWER_CORPUS_DATABASE_URL,
      curatorAllowlistConfigured: !!apiVariables.CLERK_REVIEWER_USER_IDS?.trim(),
      corpusIdentityPreserved: mode === 'apply' ? true : 'inspection-only',
    }),
  );
} finally {
  await corpus.end();
}
