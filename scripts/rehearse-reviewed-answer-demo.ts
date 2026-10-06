import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';
import { createReviewerCorpus, initializeReviewerCorpus } from '../apps/api/src/reviewer-corpus.js';
import { createHostedCorpus } from '../apps/api/src/hosted-corpus.js';
import { reviewedAnswerSource } from '../apps/api/src/reviewed-answer.js';
import { initialEditorialReview } from '../packages/contracts/src/editorial-review.js';
// Explicit isolated branch only. Never emit connection strings or original corpus text.
const branch = process.env.QA_NEON_BRANCH;
const project = process.env.QA_NEON_PROJECT;
const parent = process.env.QA_NEON_PARENT;
if (!branch || !project || !parent || branch === parent)
  throw new Error('ISOLATED_QA_TARGET_REQUIRED');
const cli = (args: string[]) =>
  execFileSync('npx', ['-y', 'neonctl', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const metadata = JSON.parse(
  cli(['api', `/projects/${project}/branches/${branch}`, '--output', 'json']),
).branch;
if (
  metadata.parent_id !== parent ||
  metadata.default ||
  metadata.protected ||
  !/^codex-191-answer-demo-qa[0-9]*$/u.test(metadata.name)
)
  throw new Error('ISOLATED_QA_IDENTITY_MISMATCH');
const url = new URL(
  cli([
    'connection-string',
    branch,
    '--project-id',
    project,
    '--role-name',
    'basirah_owner',
    '--database-name',
    'basirah_research',
  ]),
);
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');
const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  max: 1,
});
const before = (
  await pool.query(
    "select count(*)::int count,encode(public.digest(string_agg(id::text||':'||encode(content_hash,'hex'),',' order by id),'sha256'),'hex') digest from basirah.passage where provenance->>'ticketCode' is distinct from 'BR-191QA0000001'",
  )
).rows[0];
try {
  const migration = migrationChecksums(
    await readFile('migrations/0019_reviewed_answer_demo.sql', 'utf8'),
  );
  const recorded = (
    await pool.query(
      "select checksum_sha256 from basirah_private.schema_migration where version='0019_reviewed_answer_demo'",
    )
  ).rows[0];
  if (recorded) assert(migration.matchesRecorded(recorded.checksum_sha256));
  else
    await pool.query(
      migration.canonicalSql.replace(
        "'0000000000000000000000000000000000000000000000000000000000000000'",
        `'${migration.canonicalChecksum}'`,
      ),
    );
  const base = '7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f';
  const source = (
    await pool.query(
      `select p.snapshot_key,p.original_text,p.stable_reference,s.work_name,s.author_name,s.edition,s.source_url from basirah.passage p join basirah.source_edition s on s.id=p.source_edition_id where p.source_role='quran_text'  and exists(select 1 from basirah.corpus_snapshot cs where cs.passage_id=p.id and cs.corpus_version=$1) order by p.stable_reference limit 1`,
      [base],
    )
  ).rows[0];
  assert(source);
  const editorial = {
    ...initialEditorialReview(null),
    evidence: [
      {
        id: source.snapshot_key,
        work: source.work_name,
        author: source.author_name ?? '',
        edition: source.edition ?? '',
        reference: source.stable_reference,
        sourceUrl: source.source_url ?? '',
        originalText: source.original_text,
        context: '',
        sourceRole: 'quran_text' as const,
      },
    ],
  };
  const answer = reviewedAnswerSource({
    ticketCode: 'BR-191QA0000001',
    version: 1,
    actor: 'synthetic-reviewer',
    text: 'اختبار تقني اصطناعي لنشر الإجابة ومصادرها؛ ليس حكمًا شرعيًا.',
    review: editorial,
    publicAppUrl: 'https://api-staging-42bc.up.railway.app',
  });
  let curator: Awaited<ReturnType<typeof initializeReviewerCorpus>>;
  if (process.env.QA_RAILWAY_API) {
    const values = JSON.parse(
      execFileSync(
        'npx',
        [
          '-y',
          '@railway/cli@5.63.1',
          'variables',
          '-p',
          process.env.QA_RAILWAY_PROJECT!,
          '-e',
          process.env.QA_RAILWAY_ENVIRONMENT!,
          '-s',
          process.env.QA_RAILWAY_API,
          '--json',
        ],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      ),
    );
    assert.equal(values.RAILWAY_ENVIRONMENT_NAME, 'staging');
    assert.equal(values.RAILWAY_SERVICE_ID, process.env.QA_RAILWAY_API);
    const reader = new URL(values.FOUNDATION_CORPUS_DATABASE_URL);
    const writer = new URL(values.REVIEWER_CORPUS_DATABASE_URL);
    assert.equal(writer.hostname, reader.hostname.replace('-pooler.', '.'));
    reader.hostname = url.hostname;
    writer.hostname = url.hostname;
    curator = await initializeReviewerCorpus({
      ...process.env,
      FOUNDATION_CORPUS_DATABASE_URL: reader.toString(),
      REVIEWER_CORPUS_DATABASE_URL: writer.toString(),
      FOUNDATION_CORPUS_VERSION: base,
      REVIEWER_CORPUS_VERSION: `reviewed-${base}`,
    });
  }
  const writer = curator?.store ?? createReviewerCorpus(pool, `reviewed-${base}`);
  const input = {
    actor: 'synthetic-reviewer',
    ticketCode: 'BR-191QA0000001',
    version: 1,
    source: answer,
    supportingEvidence: editorial.evidence,
    rightsRecord: 'Isolated synthetic demo QA',
  };
  let receipt: { snapshotKey: string };
  try {
    receipt = await writer.approve(input);
    assert.deepEqual(await writer.approve(input), receipt);
  } finally {
    await curator?.close();
  }
  const stored = (
    await pool.query(
      'select original_text,source_role,provenance from basirah.passage where snapshot_key=$1',
      [receipt.snapshotKey],
    )
  ).rows[0];
  assert.equal(stored.original_text, answer.originalText);
  assert.equal(stored.source_role, 'reviewer_commentary');
  assert.deepEqual(stored.provenance.supportingEvidence, editorial.evidence);
  const reader = createHostedCorpus({
    pool,
    corpusVersion: base,
    reviewedCorpusVersion: `reviewed-${base}`,
    researchPreview: true,
  });
  const restored = await reader.restore([receipt.snapshotKey]);
  assert(restored.some((row) => row.snapshotKey === receipt.snapshotKey));
  assert(restored.some((row) => row.snapshotKey === source.snapshot_key));
  const exact = await reader.search(source.stable_reference, [source.stable_reference]);
  assert(exact.some((row) => row.snapshotKey === receipt.snapshotKey));
  const lexical = await reader.search('اختبار تقني اصطناعي لنشر الإجابة ومصادرها', []);
  assert(lexical.some((row) => row.snapshotKey === receipt.snapshotKey));
  assert(lexical.some((row) => row.snapshotKey === source.snapshot_key));
  const after = (
    await pool.query(
      "select count(*)::int count,encode(public.digest(string_agg(id::text||':'||encode(content_hash,'hex'),',' order by id),'sha256'),'hex') digest from basirah.passage where provenance->>'ticketCode' is distinct from 'BR-191QA0000001'",
    )
  ).rows[0];
  assert.deepEqual(after, before);
  const counts = (
    await pool.query(
      'select count(*)::int count from basirah.corpus_snapshot where corpus_version=$1',
      [base],
    )
  ).rows[0];
  assert.equal(counts.count, 175);
  console.log(
    JSON.stringify({
      branch,
      migration: '0019',
      dedicatedCuratorVerified: !!curator,
      savedAnswer: true,
      fullSupportingEvidence: true,
      idempotent: true,
      restoreWithOriginal: true,
      exactReferenceRetrieval: true,
      lexicalRetrievalWithOriginal: true,
      frozen175Unchanged: true,
    }),
  );
} finally {
  await pool.end();
}
