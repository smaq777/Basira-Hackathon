import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { createHostedCorpus } from '../apps/api/src/hosted-corpus.js';

export const SUBMISSION_CORPUS = '7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f';
export const HISTORICAL_CORPUS = '794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff';

type EmbeddingCoverage = {
  model_id: string;
  dimensions: number;
  task_type: string;
  count: number;
  covered_passages: number;
};
export function validateSubmissionEmbeddingSpace(spaces: EmbeddingCoverage[]) {
  if (
    spaces.length !== 1 ||
    spaces[0]?.model_id !== 'openai/text-embedding-3-small' ||
    spaces[0].dimensions !== 1536 ||
    spaces[0].task_type !== 'search_document' ||
    spaces[0].count !== 175 ||
    spaces[0].covered_passages !== 175
  )
    throw new Error('SUBMISSION_CORPUS_EMBEDDING_MISMATCH');
  return spaces[0];
}

/** Read only the already-ingested submission snapshot using the existing reader. */
export function submissionConnection(environment: NodeJS.ProcessEnv) {
  if ((environment.FOUNDATION_CORPUS_TLS_MODE || 'verify-full') !== 'verify-full')
    throw new Error('SUBMISSION_CORPUS_TLS_REQUIRED');
  const raw = environment.FOUNDATION_CORPUS_DATABASE_URL;
  if (!raw) throw new Error('SUBMISSION_CORPUS_READER_REQUIRED');
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^ep-fancy-base-b2o8zdbw(?:-pooler)?\.c-6\.eu-central-1\.aws\.neon\.tech$/u.test(
      url.hostname,
    ) ||
    (url.port !== '' && url.port !== '5432') ||
    url.pathname !== '/basirah_research' ||
    decodeURIComponent(url.username) !== 'basirah_corpus_reader'
  )
    throw new Error('SUBMISSION_CORPUS_TARGET_MISMATCH');
  // pg URL query parameters can override the authority's host/user/database
  // and the explicit TLS policy. This fixed-target preflight needs none of them.
  url.search = '';
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(environment.FOUNDATION_CORPUS_CA_CERT
        ? { ca: environment.FOUNDATION_CORPUS_CA_CERT }
        : {}),
    },
    max: 1,
    connectionTimeoutMillis: 15_000,
    query_timeout: 15_000,
    application_name: 'basirah-submission-corpus-preflight',
  };
}

export async function verifySubmissionCorpus(pool: Pool) {
  const current = createHostedCorpus({
    pool,
    corpusVersion: SUBMISSION_CORPUS,
    researchPreview: true,
  });
  const historical = createHostedCorpus({
    pool,
    corpusVersion: HISTORICAL_CORPUS,
    researchPreview: true,
  });
  const next = await current.readiness();
  const previous = await historical.readiness();
  if (
    !next.ready ||
    next.passages !== 175 ||
    next.embeddings !== 175 ||
    !previous.ready ||
    previous.passages !== 86 ||
    previous.embeddings !== 86
  )
    throw new Error('SUBMISSION_CORPUS_SNAPSHOT_MISMATCH');
  const client = await pool.connect();
  let spaces: EmbeddingCoverage[];
  try {
    await client.query('begin read only');
    await client.query('set local role basirah_research_runtime');
    spaces = (
      await client.query<EmbeddingCoverage>(
        `select e.model_id,e.dimensions,e.task_type,count(*)::int count,
          count(distinct membership.passage_id)::int covered_passages
          from basirah.passage_embedding e
          left join basirah.corpus_snapshot membership
            on membership.passage_id=e.passage_id and membership.corpus_version=e.corpus_version
          where e.corpus_version=$1 group by e.model_id,e.dimensions,e.task_type`,
        [SUBMISSION_CORPUS],
      )
    ).rows;
    validateSubmissionEmbeddingSpace(spaces);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  const sources = await current.restore(['tanzil-uthmani-v1.1:16:91']);
  if (
    !sources.some((source) => source.snapshotKey === 'tanzil-uthmani-v1.1:16:91') ||
    !sources.some((source) => source.snapshotKey === 'kfgqpc-muyassar-v3:16:91:tafsir')
  )
    throw new Error('SUBMISSION_CORPUS_FAMILY_MISSING');
  return {
    checkedAt: new Date().toISOString(),
    corpusVersion: SUBMISSION_CORPUS,
    readiness: next,
    historical: previous,
    embeddingSpace: spaces[0],
    restoredKeys: sources.map((source) => source.snapshotKey),
    writes: 0,
    providerCalls: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool: Pool | undefined;
  try {
    pool = new Pool(submissionConnection(process.env));
    console.log(JSON.stringify(await verifySubmissionCorpus(pool), null, 2));
  } catch (error) {
    const code =
      error instanceof Error && /^SUBMISSION_CORPUS_[A-Z_]+$/u.test(error.message)
        ? error.message
        : 'SUBMISSION_CORPUS_CHECK_FAILED';
    console.error(JSON.stringify({ status: 'failed', code }));
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
