import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { migrationChecksums } from './migration-checksum.mjs';
import { historicalCorpusChecksum } from './role-bootstrap.mjs';

// Scoped rehearsal only: no deployment, provider configuration, credentials,
// production data dump or shared-database migration. Keep the isolated database
// as evidence until the owner explicitly requests its cleanup.
const [mode, preview] = process.argv.slice(2);
if (
  !['fresh', 'shaped', 'verify'].includes(mode) ||
  !/^basirah_qa_156_[a-z0-9_]{1,30}$/u.test(preview ?? '')
)
  throw new Error('EXPLICIT_ISOLATED_REHEARSAL_REQUIRED');
const project = process.env.QA_RAILWAY_PROJECT,
  service = process.env.QA_RAILWAY_POSTGRES_SERVICE,
  environment = process.env.QA_RAILWAY_ENVIRONMENT;
if (![project, service, environment].every((value) => /^[a-f0-9-]{36}$/u.test(value ?? '')))
  throw new Error('EXPLICIT_STAGING_TARGET_REQUIRED');
const sql = [];
if (mode === 'fresh') {
  const files = (await readdir('migrations'))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  for (const file of files) {
    const migration = migrationChecksums(await readFile(`migrations/${file}`, 'utf8'));
    let body = migration.canonicalSql.replace(
      "'0000000000000000000000000000000000000000000000000000000000000000'",
      `'${migration.canonicalChecksum}'`,
    );
    if (file === '0008_typed_source_corpus.sql') {
      // Same frozen existing-roles-v1 profile as migrate.mjs. Group roles are
      // cluster-wide and already present; never alter their memberships/flags.
      if (migration.canonicalChecksum !== historicalCorpusChecksum)
        throw new Error('BOOTSTRAP_HISTORICAL_SOURCE_CHANGED');
      const declaration =
        'create role basirah_research_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;';
      if (body.split(declaration).length !== 2) throw new Error('BOOTSTRAP_SQL_BOUNDARY_CHANGED');
      body = body.replace(
        declaration,
        '-- existing-roles-v1: compatible cluster role inspected before rehearsal',
      );
    }
    sql.push(body);
  }
} else if (mode === 'shaped') {
  for (const file of [
    '0015_source_content_views.sql',
    '0016_editorial_review_versions.sql',
    '0017_reviewed_source_contributions.sql',
    '0018_email_delivery_receipts.sql',
  ]) {
    const migration = migrationChecksums(await readFile(`migrations/${file}`, 'utf8'));
    sql.push(
      migration.canonicalSql.replace(
        "'0000000000000000000000000000000000000000000000000000000000000000'",
        `'${migration.canonicalChecksum}'`,
      ),
    );
  }
}
sql.push(await readFile('scripts/sql/reviewer-rehearsal.sql', 'utf8'));
const guard = `psql -U "\${PGUSER:-postgres}" -d "\${PGDATABASE:-railway}" -v ON_ERROR_STOP=1 -Atc "select case when count(*)=4 and bool_and(not (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolcanlogin or rolbypassrls)) then 'compatible' else 'blocked' end from pg_roles where rolname in ('basirah_runtime','basirah_worker','basirah_research_runtime','basirah_cache_writer')"`;
const base = [
  '--yes',
  '@railway/cli',
  'ssh',
  '-p',
  project,
  '-s',
  service,
  '-e',
  environment,
  '--',
  'sh',
  '-lc',
];
function remote(command, input) {
  const result = spawnSync('npx', [...base, command], {
    input,
    encoding: 'utf8',
    maxBuffer: 8_000_000,
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw new Error(
      `REHEARSAL_FAILED: ${result.stderr
        .split('\n')
        .filter((line) => !line.startsWith('Using SSH key'))
        .join('\n')
        .slice(-4000)} ${result.stdout.slice(-2000)}`,
    );
  return result.stdout;
}
if (!remote(guard).includes('compatible')) throw new Error('INCOMPATIBLE_BOOTSTRAP_ROLE');
const setup = `createdb -U "\${PGUSER:-postgres}" ${preview}${mode === 'shaped' ? ` && pg_dump -U "\${PGUSER:-postgres}" -d "\${PGDATABASE:-railway}" --schema-only --no-owner | psql -U "\${PGUSER:-postgres}" -d ${preview} -v ON_ERROR_STOP=1 -q` : ''}`;
if (mode !== 'verify') remote(setup);
// The shaped database has schema only, never beneficiary/contact rows. The SQL
// test supplies synthetic equivalent-shaped records and rolls them back.
const output = remote(
  `psql -U "\${PGUSER:-postgres}" -d ${preview} -v ON_ERROR_STOP=1 -q`,
  sql.join('\n'),
);
const receipt = output
  .split('\n')
  .find((line) => line.includes('PASS: direct publication'))
  ?.trim();
if (!receipt) throw new Error('REHEARSAL_RECEIPT_MISSING');
console.log(JSON.stringify({ mode, preview, profile: 'existing-roles-v1', receipt }));
