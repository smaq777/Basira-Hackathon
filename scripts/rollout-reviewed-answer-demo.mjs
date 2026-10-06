import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';
// This forward migration targets the explicitly selected staging report/corpus only.
const mode = process.argv[2];
const project = process.env.ROLLOUT_RAILWAY_PROJECT;
const api = process.env.ROLLOUT_RAILWAY_API;
const postgres = process.env.ROLLOUT_RAILWAY_POSTGRES;
const environment = process.env.ROLLOUT_RAILWAY_ENVIRONMENT;
const neonProject = process.env.ROLLOUT_NEON_PROJECT;
const branch = process.env.ROLLOUT_NEON_BRANCH;
if (
  !['qa', 'inspect', 'apply'].includes(mode) ||
  ![project, api, postgres, environment].every((v) => /^[a-f0-9-]{36}$/u.test(v ?? '')) ||
  !neonProject ||
  !branch
)
  throw new Error('EXPLICIT_STAGING_TARGETS_REQUIRED');
const command = (args, input) => {
  try {
    return execFileSync('npx', args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
      maxBuffer: 4_000_000,
    }).trim();
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    const category =
      ['permission denied', 'already exists', 'does not exist', 'violates', 'syntax error'].find(
        (value) => stderr.includes(value),
      ) ?? 'provider command failed';
    throw new Error(`STAGING_DEMO_${category}`);
  }
};
const scope = ['-p', project, '-e', environment];
const variables = (service) => {
  const value = JSON.parse(
    command(['-y', '@railway/cli@5.63.1', 'variables', ...scope, '-s', service, '--json']),
  );
  if (
    value.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    value.RAILWAY_ENVIRONMENT_ID !== environment ||
    value.RAILWAY_SERVICE_ID !== service
  )
    throw new Error('STAGING_IDENTITY_MISMATCH');
  return value;
};
const apiVariables = variables(api),
  pgVariables = variables(postgres);
const reportUrl = new URL(apiVariables.DATABASE_URL);
if (
  reportUrl.hostname !== pgVariables.RAILWAY_PRIVATE_DOMAIN ||
  reportUrl.pathname.slice(1) !== pgVariables.PGDATABASE
)
  throw new Error('REPORT_BINDING_MISMATCH');
const user = pgVariables.PGUSER,
  database = pgVariables.PGDATABASE;
if (![user, database].every((v) => /^[a-z][a-z0-9_]{1,62}$/u.test(v)))
  throw new Error('INVALID_REPORT_TARGET');
const remote = (shell, input) =>
  command(
    ['-y', '@railway/cli@5.63.1', 'ssh', ...scope, '-s', postgres, '--', 'sh', '-lc', shell],
    input,
  );
const report = (sql, target = database) =>
  remote(`psql -U ${user} -d ${target} -v ON_ERROR_STOP=1 -Atq`, sql);
const template = await readFile('migrations/0019_reviewed_answer_demo.sql', 'utf8');
const migration = migrationChecksums(template);
const sql = migration.canonicalSql.replace(
  "'0000000000000000000000000000000000000000000000000000000000000000'",
  `'${migration.canonicalChecksum}'`,
);
if (mode === 'qa') {
  const preview = process.env.QA_REPORT_DATABASE;
  if (!/^basirah_qa_191_[a-z0-9_]{1,24}$/u.test(preview ?? ''))
    throw new Error('ISOLATED_REPORT_TARGET_REQUIRED');
  remote(`createdb -U ${user} ${preview}`);
  remote(
    `pg_dump -U ${user} -d ${database} --schema-only --no-owner | psql -U ${user} -d ${preview} -v ON_ERROR_STOP=1 -q`,
  );
  report(sql, preview);
  for (const file of [
    'scripts/sql/reviewer-rehearsal.sql',
    'scripts/sql/reviewed-answer-rehearsal.sql',
  ]) {
    const output = report(await readFile(file, 'utf8'), preview);
    const receipt = output.split('\n').find((line) => line.includes('PASS:'));
    if (!receipt) throw new Error('REHEARSAL_RECEIPT_MISSING');
    console.log(JSON.stringify({ preview, receipt }));
  }
  process.exit(0);
}
const metadata = JSON.parse(
  command([
    '-y',
    'neonctl',
    'api',
    `/projects/${neonProject}/branches/${branch}`,
    '--output',
    'json',
  ]),
).branch;
if (
  metadata.default ||
  metadata.protected ||
  metadata.primary ||
  !metadata.parent_id ||
  metadata.name !== 'basirah-research-corpus-20261005'
)
  throw new Error('STAGING_CORPUS_CHILD_REQUIRED');
const ownerUrl = new URL(
  command([
    '-y',
    'neonctl',
    'connection-string',
    branch,
    '--project-id',
    neonProject,
    '--role-name',
    'basirah_owner',
    '--database-name',
    'basirah_research',
  ]),
);
const readerUrl = new URL(apiVariables.FOUNDATION_CORPUS_DATABASE_URL);
if (
  ownerUrl.hostname !== readerUrl.hostname.replace('-pooler.', '.') ||
  ownerUrl.pathname !== readerUrl.pathname
)
  throw new Error('CORPUS_BINDING_MISMATCH');
ownerUrl.searchParams.delete('sslmode');
ownerUrl.searchParams.delete('channel_binding');
const corpus = new pg.Client({
  connectionString: ownerUrl.toString(),
  ssl: { rejectUnauthorized: true },
});
await corpus.connect();
try {
  const manifest = new Map();
  for (const file of (await readdir('migrations')).filter((name) =>
    /^\d+_[a-z0-9_]+\.sql$/u.test(name),
  ))
    manifest.set(
      file.replace(/\.sql$/u, ''),
      migrationChecksums(await readFile(`migrations/${file}`, 'utf8')),
    );
  const reportRows = JSON.parse(
    report('select json_agg(m order by version) from basirah_private.schema_migration m;'),
  );
  const corpusRows = (
    await corpus.query(
      'select version,checksum_sha256 from basirah_private.schema_migration order by version',
    )
  ).rows;
  for (const rows of [reportRows, corpusRows])
    for (const row of rows)
      if (!manifest.get(row.version)?.matchesRecorded(row.checksum_sha256))
        throw new Error(`MIGRATION_DRIFT_${row.version}`);
  if (
    !reportRows.some((row) => row.version === '0018_email_delivery_receipts') ||
    !corpusRows.some((row) => row.version === '0017_reviewed_source_contributions')
  )
    throw new Error('REQUIRED_STAGING_SCHEMA_MISSING');
  const fingerprint =
    "select count(*)::int count,encode(public.digest(string_agg(id::text||':'||encode(content_hash,'hex'),',' order by id),'sha256'),'hex') digest from basirah.passage";
  const before = (await corpus.query(fingerprint)).rows[0];
  const missing = (rows) => !rows.some((row) => row.version === '0019_reviewed_answer_demo');
  if (mode === 'apply') {
    if (missing(corpusRows)) await corpus.query(sql);
    if (missing(reportRows)) report(sql);
    const after = (await corpus.query(fingerprint)).rows[0];
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('ORIGINAL_CORPUS_CHANGED');
  }
  console.log(
    JSON.stringify({
      mode,
      reportMigrationRequired: missing(reportRows),
      corpusMigrationRequired: missing(corpusRows),
      existingPassages: before.count,
      originalCorpusPreserved: mode === 'apply',
    }),
  );
} finally {
  await corpus.end();
}
