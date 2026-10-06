import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';

process.on('uncaughtException', (error) => {
  console.error(
    JSON.stringify({
      failure: /^REPAIR_[A-Z_]+$/u.test(error.message) ? error.message : 'REPAIR_FAILED',
      sqlCode: /^[0-9A-Z]{5}$/u.test(error.code ?? '') ? error.code : undefined,
    }),
  );
  process.exitCode = 1;
});

// Issue #193: explicit staging repair, no ingestion, embeddings, production,
// reader replacement, credential rotation, raw variables or local env files.
const mode = process.argv[2];
const project = '9837ef84-08f3-4228-b7ac-f3b3dc25fba0';
const service = '4d15a8f1-0028-42d6-adfa-cef07e55a9bc';
const environment = '97179b92-48b1-412f-95ff-1901bb826458';
const neonProject = 'weathered-pond-44811639';
const activeBranch = 'br-wandering-unit-b24xqw5d';
const branch = mode === 'rehearse' ? process.env.REPAIR_QA_BRANCH : activeBranch;
if (!['inspect', 'rehearse', 'apply'].includes(mode) || !/^br-[a-z0-9-]+$/u.test(branch ?? ''))
  throw new Error('EXPLICIT_REPAIR_MODE_REQUIRED');
function command(args, input) {
  try {
    return execFileSync('npx', ['--yes', ...args], {
      input,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('REPAIR_OPERATOR_COMMAND_FAILED');
  }
}
const scope = ['--project', project, '--service', service, '--environment', environment];
const values = JSON.parse(command(['@railway/cli', 'variable', 'list', ...scope, '--json']));
if (
  values.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
  values.RAILWAY_ENVIRONMENT_ID !== environment ||
  values.RAILWAY_PROJECT_ID !== project ||
  values.RAILWAY_SERVICE_ID !== service ||
  values.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'staging'
)
  throw new Error('REPAIR_STAGING_IDENTITY_MISMATCH');
const metadata = JSON.parse(
  command(['neon', 'api', `/projects/${neonProject}/branches/${branch}`]),
).branch;
if (
  metadata.id !== branch ||
  metadata.default ||
  metadata.protected ||
  !metadata.parent_id ||
  (mode === 'rehearse' &&
    (metadata.parent_id !== activeBranch ||
      !metadata.name.startsWith('codex-193-') ||
      !(Date.parse(metadata.expires_at) > Date.now())))
)
  throw new Error('REPAIR_BRANCH_IDENTITY_MISMATCH');
const reader = new URL(values.FOUNDATION_CORPUS_DATABASE_URL);
const url = new URL(
  command([
    'neon',
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
if (
  url.pathname !== reader.pathname ||
  (mode !== 'rehearse' && url.hostname !== reader.hostname.replace('-pooler.', '.'))
)
  throw new Error('REPAIR_DATABASE_BINDING_MISMATCH');
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');
const owner = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 8000,
});
await owner.connect();
try {
  const baseline = async () =>
    (
      await owner.query(`select count(*)::int passages,
    encode(public.digest(coalesce(string_agg(snapshot_key||':'||encode(content_hash,'hex'),',' order by snapshot_key),''),'sha256'),'hex') digest
    from basirah.passage`)
    ).rows[0];
  const before = await baseline();
  if (before.passages !== 175) throw new Error('REPAIR_BASELINE_CHANGED');
  const migration = migrationChecksums(
    await readFile('migrations/0017_reviewed_source_contributions.sql', 'utf8'),
  );
  const installed = (
    await owner.query(
      "select checksum_sha256 from basirah_private.schema_migration where version='0017_reviewed_source_contributions'",
    )
  ).rows[0];
  if (installed && !migration.matchesRecorded(installed.checksum_sha256))
    throw new Error('REPAIR_MIGRATION_DRIFT');
  if (mode === 'inspect') {
    console.log(
      JSON.stringify({ mode, branch, passages: before.passages, approvalInstalled: !!installed }),
    );
  } else {
    // Only the source approval migration is needed in the corpus database.
    // Report/ticket/email migrations are deliberately not copied into this DB.
    if (!installed)
      await owner.query(
        migration.canonicalSql.replace(
          "'0000000000000000000000000000000000000000000000000000000000000000'",
          `'${migration.canonicalChecksum}'`,
        ),
      );
    const roleName =
      mode === 'rehearse'
        ? `basirah_qa_curator_193_${randomBytes(4).toString('hex')}`
        : 'basirah_reviewer_curator_193';
    if (
      (
        await owner.query('select exists(select 1 from pg_roles where rolname=$1) present', [
          roleName,
        ])
      ).rows[0].present
    )
      throw new Error('REPAIR_ROLE_ALREADY_EXISTS_DO_NOT_ROTATE');
    const password = randomBytes(32).toString('base64url');
    await owner.query('begin');
    await owner.query(
      "select set_config('basirah.curator_role',$1,true),set_config('basirah.curator_password',$2,true)",
      [roleName, password],
    );
    await owner.query(await readFile('scripts/sql/reviewer-corpus-role.sql', 'utf8'));
    await owner.query('commit');
    const writerUrl = new URL(url);
    writerUrl.username = roleName;
    writerUrl.password = password;
    const writer = new pg.Client({
      connectionString: writerUrl.toString(),
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 8000,
    });
    await writer.connect();
    try {
      const scoped = (
        await writer.query(`select has_function_privilege(current_user,'basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)','EXECUTE')
        and not pg_has_role(current_user,'basirah_research_runtime','MEMBER') and not pg_has_role(current_user,'basirah_runtime','MEMBER')
        and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='basirah' and c.relname in ('passage','source_edition')
          and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE')) scoped`)
      ).rows[0].scoped;
      if (!scoped) throw new Error('REPAIR_WRITER_PERMISSIONS_UNSAFE');
      if (mode === 'rehearse') {
        await writer.query('begin');
        const source = {
          sourceRole: 'book_excerpt',
          work: 'Synthetic QA only',
          author: 'Synthetic QA author',
          edition: 'QA',
          rightsRecord: 'Synthetic rollback fixture',
          sourceUrl: 'https://example.com/qa',
          originalText: 'نص اصطناعي لاختبار نشر الدليل فقط',
          reference: 'qa:193',
          ticketCode: 'BR-193QA0000001',
          reviewVersion: 1,
        };
        const { createHash } = await import('node:crypto');
        const overlay = `reviewed-${values.FOUNDATION_CORPUS_VERSION}`;
        const args = [
          'reviewed-19300000000000000000000000000001',
          overlay,
          source.originalText,
          createHash('sha256').update(source.originalText).digest('hex'),
          'synthetic-reviewer',
          JSON.stringify(source),
        ];
        const sql = 'select basirah_api.approve_editorial_source($1,$2,$3,$4,$5,$6::jsonb) value';
        const first = (await writer.query(sql, args)).rows[0].value;
        const second = (await writer.query(sql, args)).rows[0].value;
        if (first.snapshotKey !== second.snapshotKey) throw new Error('REPAIR_IDEMPOTENCY_FAILED');
        const original = (
          await owner.query(
            'select count(*)::int count from basirah.corpus_snapshot where corpus_version=$1',
            [values.FOUNDATION_CORPUS_VERSION],
          )
        ).rows[0].count;
        if (original !== 175) throw new Error('REPAIR_BASE_CORPUS_MUTATED');
        await writer.query('rollback');
        await owner.query('begin');
        await owner.query(sql, args);
        await owner.query('set local role basirah_research_runtime');
        const visible = (
          await owner.query(
            `select count(*)::int count from basirah.passage p
          join basirah.source_edition s on s.id=p.source_edition_id
          where p.snapshot_key=$1 and s.approval_status='approved'
          and p.provenance->>'source'='reviewer_approved_original'
          and exists(select 1 from basirah.corpus_snapshot c where c.passage_id=p.id and c.corpus_version=$2)
          and (p.stable_reference=$3 or public.word_similarity($4,p.search_key)>0.08)`,
            [first.snapshotKey, overlay, source.reference, source.originalText],
          )
        ).rows[0].count;
        if (visible !== 1) throw new Error('REPAIR_READER_VISIBILITY_FAILED');
        await owner.query('rollback');
      } else {
        if (values.REVIEWER_CORPUS_DATABASE_URL_PRE193)
          throw new Error('REPAIR_BACKUP_ALREADY_EXISTS');
        const set = (name, value) =>
          command(
            ['@railway/cli', 'variable', 'set', name, ...scope, '--stdin', '--skip-deploys'],
            value,
          );
        if (values.REVIEWER_CORPUS_DATABASE_URL)
          set('REVIEWER_CORPUS_DATABASE_URL_PRE193', values.REVIEWER_CORPUS_DATABASE_URL);
        writerUrl.searchParams.set('sslmode', 'verify-full');
        set('REVIEWER_CORPUS_DATABASE_URL', writerUrl.toString());
        set('REVIEWER_CORPUS_VERSION', `reviewed-${values.FOUNDATION_CORPUS_VERSION}`);
        const after = JSON.parse(command(['@railway/cli', 'variable', 'list', ...scope, '--json']));
        if (
          after.FOUNDATION_CORPUS_DATABASE_URL !== values.FOUNDATION_CORPUS_DATABASE_URL ||
          after.REVIEWER_CORPUS_DATABASE_URL !== writerUrl.toString() ||
          after.REVIEWER_CORPUS_VERSION !== `reviewed-${values.FOUNDATION_CORPUS_VERSION}`
        )
          throw new Error('REPAIR_CONFIG_READBACK_FAILED');
      }
      if (JSON.stringify(await baseline()) !== JSON.stringify(before))
        throw new Error('REPAIR_ORIGINAL_CONTENT_CHANGED');
      const readerCanWrite = (
        await owner.query(
          "select has_function_privilege('basirah_corpus_reader','basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)','EXECUTE') value",
        )
      ).rows[0].value;
      if (readerCanWrite) throw new Error('REPAIR_READER_WRITE_CAPABILITY');
      console.log(
        JSON.stringify({
          mode,
          branch,
          scopedWriterVerified: true,
          baseCorpusUnchanged: true,
          readerCannotWrite: true,
          overlayConfigured: mode === 'apply',
          deploymentTriggered: false,
        }),
      );
    } finally {
      await writer.end();
    }
    if (JSON.stringify(await baseline()) !== JSON.stringify(before))
      throw new Error('REPAIR_ORIGINAL_CONTENT_CHANGED');
  }
} finally {
  await owner.end();
}
