import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const bootstrapRoles = [
  'basirah_runtime',
  'basirah_worker',
  'basirah_research_runtime',
  'basirah_cache_writer',
];
export const historicalCorpusChecksum =
  'e649f32adafd47f9a04c386291a1f079fde2d1530fdbfe9725a8adfa6a27cf94';
const version = '0008_typed_source_corpus';
const declaration =
  'create role basirah_research_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;';
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function roleBootstrapMode(value) {
  const mode = value?.trim() || 'strict';
  if (!['strict', 'existing-roles-v1'].includes(mode))
    throw new Error('MIGRATION_ROLE_BOOTSTRAP must be strict or existing-roles-v1');
  return mode;
}

/** Incoming runtime logins retain their grants; these group roles may not escalate outward. */
export function validateBootstrapRoles(rows, memberships) {
  for (const role of rows) {
    if (
      !bootstrapRoles.includes(role.rolname) ||
      [
        'rolsuper',
        'rolcreatedb',
        'rolcreaterole',
        'rolinherit',
        'rolcanlogin',
        'rolreplication',
        'rolbypassrls',
      ].some((attribute) => role[attribute] !== false) ||
      memberships.some((member) => member.member === role.oid)
    )
      throw new Error(`INCOMPATIBLE_BOOTSTRAP_ROLE: ${role.rolname}`);
  }
}

export async function inspectBootstrapRoles(client) {
  const roles = await client.query(
    `select oid,rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin,
            rolreplication,rolbypassrls from pg_catalog.pg_roles
     where rolname = any($1::text[]) order by rolname`,
    [bootstrapRoles],
  );
  const memberships = await client.query(
    'select member from pg_catalog.pg_auth_members where member = any($1::oid[])',
    [roles.rows.map((role) => role.oid)],
  );
  validateBootstrapRoles(roles.rows, memberships.rows);
  return roles.rows;
}

/** Only the frozen historical role declaration is segmented; source SQL/checksums stay unchanged. */
export async function executeCopiedRoleBootstrap(client, migration) {
  if (migration.version !== version || migration.checksum !== historicalCorpusChecksum)
    throw new Error('BOOTSTRAP_HISTORICAL_SOURCE_CHANGED');
  const parts = migration.sql.split(declaration);
  if (parts.length !== 2 || !/\ncommit;\s*$/u.test(parts[1]))
    throw new Error('BOOTSTRAP_SQL_BOUNDARY_CHANGED');
  const suffix = parts[1].replace(/\ncommit;\s*$/u, '\n');
  const executionPlanSha256 = digest(
    JSON.stringify({
      profile: 'existing-roles-v1',
      checksum: migration.checksum,
      parts: [parts[0], declaration, suffix],
    }),
  );
  const runnerSha256 = digest(readFileSync(new URL(import.meta.url)));
  try {
    await client.query(parts[0]);
    await client.query('savepoint basirah_role_bootstrap');
    let action = 'created';
    try {
      await client.query(declaration);
    } catch (error) {
      if (error.code !== '42710') throw error;
      await client.query('rollback to savepoint basirah_role_bootstrap');
      action = 'reused';
    }
    const roles = await inspectBootstrapRoles(client);
    if (!roles.some((role) => role.rolname === 'basirah_research_runtime'))
      throw new Error('BOOTSTRAP_ROLE_MISSING');
    await client.query('release savepoint basirah_role_bootstrap');
    await client.query(suffix);
    // This side receipt commits atomically with the canonical schema_migration record.
    await client.query(`
      create table basirah_private.migration_execution_receipt (
        version text primary key references basirah_private.schema_migration(version),
        profile text not null check (profile='existing-roles-v1'),
        source_checksum_sha256 text not null check (source_checksum_sha256 ~ '^[0-9a-f]{64}$'),
        execution_plan_sha256 text not null check (execution_plan_sha256 ~ '^[0-9a-f]{64}$'),
        runner_sha256 text not null check (runner_sha256 ~ '^[0-9a-f]{64}$'),
        role_action text not null check (role_action in ('created','reused')),
        verified_roles jsonb not null check (jsonb_typeof(verified_roles)='array'),
        recorded_at timestamptz not null default clock_timestamp()
      );
      alter table basirah_private.migration_execution_receipt enable row level security;
      revoke all on basirah_private.migration_execution_receipt from public;
      create trigger migration_execution_receipt_immutable before update or delete
        on basirah_private.migration_execution_receipt
        for each row execute function basirah_private.reject_immutable_update();
    `);
    await client.query(
      `insert into basirah_private.migration_execution_receipt
       (version,profile,source_checksum_sha256,execution_plan_sha256,runner_sha256,role_action,verified_roles)
       values ($1,'existing-roles-v1',$2,$3,$4,$5,$6::jsonb)`,
      [
        version,
        migration.checksum,
        executionPlanSha256,
        runnerSha256,
        action,
        JSON.stringify(roles),
      ],
    );
    await client.query('commit');
    return {
      profile: 'existing-roles-v1',
      version,
      sourceChecksumSha256: migration.checksum,
      executionPlanSha256,
      runnerSha256,
      roleAction: action,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
