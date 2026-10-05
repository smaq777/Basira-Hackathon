import pg from 'pg';
import { readdir } from 'node:fs/promises';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const url = new URL(connectionString);
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');
const tlsMode = process.env.DATABASE_TLS_MODE?.trim() || 'verify-full';
if (!['verify-full', 'require', 'disable'].includes(tlsMode))
  throw new Error('DATABASE_TLS_MODE must be verify-full, require, or disable');
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/gu, '\n').trim();
const client = new Client({
  connectionString: url.toString(),
  ssl:
    tlsMode === 'disable'
      ? false
      : {
          rejectUnauthorized: tlsMode === 'verify-full',
          ...(ca ? { ca } : {}),
        },
  application_name: 'basirah-database-verifier',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await client.connect();
try {
  const migrationVersions = (await readdir('migrations'))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/u.test(file))
    .sort()
    .map((file) => file.replace(/\.sql$/u, ''));
  const expectedMigration = migrationVersions.at(-1);
  const readiness = await client.query('select * from basirah_api.readiness()');
  assert(readiness.rows[0]?.migration_version === expectedMigration, 'Migration is not current');

  const rls = await client.query(`
    select count(*)::int as count,
           count(*) filter (where c.relrowsecurity)::int as protected_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('basirah', 'basirah_private')
      and c.relkind = 'r'
  `);
  assert(
    rls.rows[0]?.count === rls.rows[0]?.protected_count,
    'Every Basirah table must have RLS enabled',
  );

  const publicPrivileges = await client.query(`
    select count(*)::int as count
    from information_schema.role_table_grants
    where grantee = 'PUBLIC' and table_schema in ('basirah', 'basirah_private')
  `);
  assert(publicPrivileges.rows[0]?.count === 0, 'PUBLIC table privileges detected');

  const expectedIndexes = [
    'guest_session_expiry_idx',
    'document_session_created_idx',
    'claim_revision_ordinal_uidx',
    'source_edition_active_idx',
    'passage_search_key_trgm_idx',
    'passage_embedding_compatible_space_idx',
    'review_run_active_lease_idx',
    'evidence_item_run_rank_idx',
    'finding_evidence_evidence_idx',
    'review_packet_expiry_idx',
  ];
  const indexes = await client.query(
    `select indexname from pg_indexes where schemaname = 'basirah' and indexname = any($1::text[])`,
    [expectedIndexes],
  );
  assert(indexes.rowCount === expectedIndexes.length, 'Required index is missing');

  await client.query('begin isolation level serializable');
  const first = (await client.query('select * from basirah_api.create_guest_session(1)')).rows[0];
  const second = (await client.query('select * from basirah_api.create_guest_session(1)')).rows[0];
  assert(first && second, 'Synthetic sessions were not created');

  const firstId = (
    await client.query('select basirah_api.authenticate_guest($1::uuid, $2::text) as id', [
      first.session_public_id,
      first.ownership_secret,
    ])
  ).rows[0]?.id;
  assert(firstId, 'First session authentication failed');
  const document = (
    await client.query(
      `insert into basirah.document (session_id)
       values ((select basirah_private.current_session_id()))
       returning id, public_id`,
    )
  ).rows[0];
  const revision = (
    await client.query(
      `insert into basirah.document_revision
         (document_id, version, original_text, content_hash)
       values ($1, 1, 'نص اصطناعي للاختبار فقط', digest('synthetic', 'sha256'))
       returning id`,
      [document.id],
    )
  ).rows[0];
  await client.query('update basirah.document set current_revision_id = $1 where id = $2', [
    revision.id,
    document.id,
  ]);

  await client.query('select basirah_api.authenticate_guest($1::uuid, $2::text)', [
    second.session_public_id,
    second.ownership_secret,
  ]);
  const isolated = await client.query('select id from basirah.document where public_id = $1', [
    document.public_id,
  ]);
  assert(isolated.rowCount === 0, 'Cross-session document access was not denied');

  await client.query("select set_config('basirah.session_id', $1, true)", [String(firstId)]);
  const forged = await client.query('select id from basirah.document where public_id = $1', [
    document.public_id,
  ]);
  assert(forged.rowCount === 0, 'Forged session context bypassed isolation');

  await client.query('select basirah_api.authenticate_guest($1::uuid, $2::text)', [
    first.session_public_id,
    first.ownership_secret,
  ]);
  const owned = await client.query('select id from basirah.document where public_id = $1', [
    document.public_id,
  ]);
  assert(owned.rowCount === 1, 'Owner could not read its document');

  await client.query('savepoint immutable_check');
  let immutableRejected = false;
  try {
    await client.query('update basirah.document_revision set original_text = $1 where id = $2', [
      'mutated',
      revision.id,
    ]);
  } catch (error) {
    immutableRejected = error instanceof Error && 'code' in error && error.code === '55000';
    await client.query('rollback to savepoint immutable_check');
  }
  assert(immutableRejected, 'Immutable revision update was accepted');
  await client.query('rollback');
  console.log(
    'Database verification passed: migration, RLS, isolation, immutability, and indexes.',
  );
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
