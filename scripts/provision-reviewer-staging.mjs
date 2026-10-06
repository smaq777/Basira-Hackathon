import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Owner-authorized staging provisioning only. Secrets stay in memory/stdin;
// existing connections, credentials and grants are never rotated or overwritten.
const project = process.env.ROLLOUT_RAILWAY_PROJECT;
const api = process.env.ROLLOUT_RAILWAY_API;
const environment = process.env.ROLLOUT_RAILWAY_ENVIRONMENT;
const neonProject = process.env.ROLLOUT_NEON_PROJECT;
const neonBranch = process.env.ROLLOUT_NEON_BRANCH;
if (
  ![project, api, environment].every((id) => /^[a-f0-9-]{36}$/u.test(id ?? '')) ||
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
    throw new Error('STAGING_PROVISION_PROVIDER_FAILED');
  }
}
const railway = ['--yes', '@railway/cli'];
const scope = ['-p', project, '-e', environment, '-s', api];
const values = JSON.parse(command([...railway, 'variables', ...scope, '--json']));
if (
  values.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
  values.RAILWAY_ENVIRONMENT_ID !== environment ||
  values.RAILWAY_PROJECT_ID !== project ||
  values.RAILWAY_SERVICE_ID !== api ||
  (values.BASIRAH_DEPLOYMENT_ENVIRONMENT && values.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'staging')
)
  throw new Error('RAILWAY_STAGING_IDENTITY_MISMATCH');
if (values.REVIEWER_CORPUS_DATABASE_URL)
  throw new Error('CURATOR_ALREADY_CONFIGURED_INSPECT_DO_NOT_REPLACE');
const branch = JSON.parse(
  command(['neon', 'api', `/projects/${neonProject}/branches/${neonBranch}`, '-o', 'json']),
).branch;
if (
  branch?.id !== neonBranch ||
  branch.default ||
  branch.primary ||
  branch.protected ||
  !branch.parent_id ||
  branch.current_state !== 'ready'
)
  throw new Error('NEON_STAGING_CHILD_REQUIRED');
const reader = new URL(values.FOUNDATION_CORPUS_DATABASE_URL);
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
    decodeURIComponent(reader.pathname.slice(1)),
  ]),
);
if (
  ownerUrl.hostname !== reader.hostname.replace('-pooler.', '.') ||
  ownerUrl.pathname !== reader.pathname
)
  throw new Error('NEON_CORPUS_BINDING_MISMATCH');
ownerUrl.searchParams.delete('sslmode');
ownerUrl.searchParams.delete('channel_binding');
const owner = new pg.Client({
  connectionString: ownerUrl.toString(),
  ssl: { rejectUnauthorized: true },
});
await owner.connect();
try {
  const migration = await owner.query(
    "select 1 from basirah_private.schema_migration where version='0017_reviewed_source_contributions'",
  );
  if (!migration.rowCount) throw new Error('SOURCE_APPROVAL_MIGRATION_REQUIRED');
  const password = randomBytes(32).toString('base64url');
  await owner.query('begin');
  try {
    if (process.argv[2] === '--recover-new-role') {
      // Only recover this task's newly provisioned login after the verification
      // failure. Never use this option to rotate an existing deployed credential.
      const safe = (
        await owner.query(`select not rolsuper and not rolcreatedb and not rolcreaterole
        and not rolinherit and not rolbypassrls and rolcanlogin
        and not exists(select 1 from pg_auth_members m where m.member=r.oid)
        and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='basirah' and c.relname in ('passage','source_edition')
          and has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE')) as safe
        from pg_roles r where rolname='basirah_reviewer_curator'`)
      ).rows[0];
      if (!safe?.safe) throw new Error('NEW_CURATOR_RECOVERY_UNSAFE');
      await owner.query("select set_config('basirah.curator_password',$1,true)", [password]);
      await owner.query(
        `do $$ begin execute format('alter role basirah_reviewer_curator password %L',current_setting('basirah.curator_password'));end $$;`,
      );
    } else {
      await owner.query(
        "select set_config('basirah.curator_role',$1,true),set_config('basirah.curator_password',$2,true)",
        ['basirah_reviewer_curator', password],
      );
      await owner.query(await readFile('scripts/sql/reviewer-corpus-role.sql', 'utf8'));
    }
    await owner.query('commit');
  } catch (error) {
    await owner.query('rollback');
    throw error;
  }
  const curatorUrl = new URL(ownerUrl);
  curatorUrl.username = 'basirah_reviewer_curator';
  curatorUrl.password = password;
  const curator = new pg.Client({
    connectionString: curatorUrl.toString(),
    ssl: { rejectUnauthorized: true },
  });
  await curator.connect();
  try {
    const permissions = (
      await curator.query(`select has_function_privilege(current_user,'basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)','EXECUTE')
      and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='basirah' and c.relname in ('passage','source_edition')
        and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE'))
      and not pg_has_role(current_user,'basirah_research_runtime','MEMBER')
      and not pg_has_role(current_user,'basirah_runtime','MEMBER') as scoped`)
    ).rows[0];
    if (!permissions.scoped) throw new Error('CURATOR_PERMISSION_VERIFICATION_FAILED');
  } finally {
    await curator.end();
  }
  curatorUrl.searchParams.set('sslmode', 'verify-full');
  // Skip automatic deploys: migrate/configure first, deploy the reviewed SHA once.
  command(
    [
      ...railway,
      'variable',
      'set',
      'REVIEWER_CORPUS_DATABASE_URL',
      ...scope,
      '--stdin',
      '--skip-deploys',
      '--json',
    ],
    curatorUrl.toString(),
  );
  command(
    [
      ...railway,
      'variable',
      'set',
      'REVIEWER_CORPUS_ACCESS_MODE',
      ...scope,
      '--stdin',
      '--skip-deploys',
      '--json',
    ],
    'authenticated',
  );
  const after = JSON.parse(command([...railway, 'variables', ...scope, '--json']));
  if (
    after.REVIEWER_CORPUS_DATABASE_URL !== curatorUrl.toString() ||
    after.REVIEWER_CORPUS_ACCESS_MODE !== 'authenticated' ||
    after.FOUNDATION_CORPUS_DATABASE_URL !== values.FOUNDATION_CORPUS_DATABASE_URL
  )
    throw new Error('STAGING_PROVISION_VERIFICATION_FAILED');
  console.log(
    JSON.stringify({
      curatorConfigured: true,
      authenticatedStagingAccess: true,
      scopedPermissionsVerified: true,
      readerConfigurationPreserved: true,
      deploymentTriggered: false,
    }),
  );
} finally {
  await owner.end();
}
