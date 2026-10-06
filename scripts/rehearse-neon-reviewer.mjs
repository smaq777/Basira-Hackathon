import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';

// Never link/checkout, pull env, print credentials, or mutate a shared branch.
// The already-created, expiring QA child must be explicitly identified.
const project = process.env.QA_NEON_PROJECT;
const branch = process.env.QA_NEON_BRANCH;
const parent = process.env.QA_NEON_PARENT;
const hostname = process.env.QA_NEON_HOST;
if (!project || !branch || !parent || !hostname || branch === parent)
  throw new Error('EXPLICIT_ISOLATED_NEON_TARGET_REQUIRED');
function neon(args) {
  try {
    return execFileSync('npx', ['neon', ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 2_000_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('NEON_QA_CLI_FAILED');
  }
}
const metadata = JSON.parse(
  neon(['api', `/projects/${project}/branches/${branch}`, '-o', 'json']),
).branch;
if (
  metadata?.id !== branch ||
  metadata.parent_id !== parent ||
  !/^codex-156-/u.test(metadata.name) ||
  metadata.default ||
  metadata.primary ||
  metadata.protected ||
  metadata.current_state !== 'ready' ||
  !(Date.parse(metadata.expires_at) > Date.now())
)
  throw new Error('NOT_AN_EXPIRING_REVIEWER_QA_CHILD');
const raw = neon([
  'connection-string',
  branch,
  '--project-id',
  project,
  '--role-name',
  'basirah_owner',
  '--database-name',
  'basirah_research',
]);
const url = new URL(raw);
if (
  url.hostname !== hostname ||
  hostname.includes('-pooler.') ||
  url.pathname !== '/basirah_research'
)
  throw new Error('QA_DIRECT_ENDPOINT_MISMATCH');
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');
const owner = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
});
await owner.connect();
try {
  const before = (await owner.query('select count(*)::int as count from basirah.passage')).rows[0]
    .count;
  const files = (await readdir('migrations'))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  const applied = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/u, '');
    const migration = migrationChecksums(await readFile(`migrations/${file}`, 'utf8'));
    const recorded = (
      await owner.query(
        'select checksum_sha256 from basirah_private.schema_migration where version=$1',
        [version],
      )
    ).rows[0];
    if (recorded) {
      if (!migration.matchesRecorded(recorded.checksum_sha256))
        throw new Error(`CHECKSUM_DRIFT_${version}`);
      continue;
    }
    if (Number(version.slice(0, 4)) < 13) throw new Error('QA_PARENT_SCHEMA_TOO_OLD');
    await owner.query(
      migration.canonicalSql.replace(
        "'0000000000000000000000000000000000000000000000000000000000000000'",
        `'${migration.canonicalChecksum}'`,
      ),
    );
    applied.push(version);
  }
  await owner.query(await readFile('scripts/sql/reviewer-rehearsal.sql', 'utf8'));
  const reader = (
    await owner.query(`select has_function_privilege('basirah_corpus_reader',
    'basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('basirah_research_runtime',
    'basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)','EXECUTE') as can_write`)
  ).rows[0];
  if (reader.can_write) throw new Error('CORPUS_READER_WRITE_CAPABILITY');

  const password = randomBytes(32).toString('base64url');
  await owner.query('begin');
  try {
    await owner.query(
      "select set_config('basirah.curator_role',$1,true),set_config('basirah.curator_password',$2,true)",
      ['basirah_qa_curator_156', password],
    );
    await owner.query(await readFile('scripts/sql/reviewer-corpus-role.sql', 'utf8'));
    await owner.query('commit');
  } catch (error) {
    await owner.query('rollback');
    throw error;
  }
  const curatorUrl = new URL(url);
  curatorUrl.username = 'basirah_qa_curator_156';
  curatorUrl.password = password;
  const curator = new pg.Client({
    connectionString: curatorUrl.toString(),
    ssl: { rejectUnauthorized: true },
  });
  await curator.connect();
  try {
    await curator.query('begin');
    const source = {
      sourceRole: 'book_excerpt',
      work: 'Synthetic curator work',
      author: 'Synthetic author',
      edition: 'QA edition',
      rightsRecord: 'Synthetic test only',
      sourceUrl: 'https://example.com/qa-source',
      originalText: 'نص اصطناعي لاختبار المصدر فقط',
      reference: 'qa:156',
      ticketCode: 'BR-156QA0000002',
      reviewVersion: 1,
    };
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(source.originalText).digest('hex');
    const values = [
      'reviewed-15600000000000000000000000000002',
      'qa-156',
      source.originalText,
      hash,
      'synthetic-reviewer',
      JSON.stringify(source),
    ];
    await curator.query(
      'select basirah_api.approve_editorial_source($1,$2,$3,$4,$5,$6::jsonb)',
      values,
    );
    await curator.query(
      'select basirah_api.approve_editorial_source($1,$2,$3,$4,$5,$6::jsonb)',
      values,
    );
    await curator.query('savepoint invalid_source');
    let rejected = false;
    try {
      await curator.query('select basirah_api.approve_editorial_source($1,$2,$3,$4,$5,$6::jsonb)', [
        ...values.slice(0, 5),
        JSON.stringify({ ...source, author: null }),
      ]);
    } catch {
      rejected = true;
      await curator.query('rollback to savepoint invalid_source');
    }
    if (!rejected) throw new Error('NULL_SOURCE_PROVENANCE_ACCEPTED');
    await curator.query('savepoint direct_write');
    rejected = false;
    try {
      await curator.query("update basirah.passage set original_text='mutated'");
    } catch {
      rejected = true;
      await curator.query('rollback to savepoint direct_write');
    }
    if (!rejected) throw new Error('CURATOR_DIRECT_TABLE_WRITE');
    await curator.query('rollback');
  } finally {
    await curator.end();
    // Remove only the credential created by this run on this verified QA child.
    // No shared roles, ownership or user data are reset or removed.
    await owner.query(
      'revoke execute on function basirah_api.approve_editorial_source(text,text,text,text,text,jsonb) from basirah_qa_curator_156',
    );
    await owner.query('revoke usage on schema basirah_api from basirah_qa_curator_156');
    await owner.query('drop role basirah_qa_curator_156');
  }
  const after = (await owner.query('select count(*)::int as count from basirah.passage')).rows[0]
    .count;
  if (after !== before) throw new Error('SYNTHETIC_CORPUS_ROWS_NOT_ROLLED_BACK');
  console.log(
    JSON.stringify({
      branch,
      applied,
      originalPassagesPreserved: before,
      receipt:
        'PASS: full reviewer rehearsal; corpus reader write denial; dedicated curator login/function; idempotent source approval; null provenance rejection; direct table-write denial; synthetic rollback',
    }),
  );
} finally {
  await owner.end();
}
