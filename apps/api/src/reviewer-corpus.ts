import { Pool } from 'pg';
import type { EditorialReview } from '../../../packages/contracts/src/editorial-review.js';
import { sha256 } from './foundation.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import { databaseTls } from './database.js';

export function reviewerCorpusAccessMode(
  environment: NodeJS.ProcessEnv,
): 'allowlist' | 'authenticated' {
  const mode = environment.REVIEWER_CORPUS_ACCESS_MODE?.trim() || 'allowlist';
  if (mode === 'allowlist') return mode;
  if (
    mode === 'authenticated' &&
    environment.RAILWAY_ENVIRONMENT_NAME === 'staging' &&
    (!environment.BASIRAH_DEPLOYMENT_ENVIRONMENT ||
      environment.BASIRAH_DEPLOYMENT_ENVIRONMENT === 'staging')
  )
    return mode;
  throw new Error('REVIEWER_CORPUS_ACCESS_MODE_INVALID');
}

export function reviewedAnswerDemoEnabled(environment: NodeJS.ProcessEnv): boolean {
  return (
    environment.REVIEWER_CORPUS_PUBLICATION_MODE === 'reviewed_answer_demo' &&
    environment.RAILWAY_ENVIRONMENT_NAME === 'staging' &&
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT === 'staging'
  );
}

export function reviewerCorpusConnection(environment: NodeJS.ProcessEnv) {
  const configured = environment.REVIEWER_CORPUS_DATABASE_URL;
  if (!configured) return undefined;
  const reader = new URL(environment.FOUNDATION_CORPUS_DATABASE_URL ?? '');
  const curator = new URL(configured);
  if (
    !['postgres:', 'postgresql:'].includes(curator.protocol) ||
    curator.hostname.replace('-pooler.', '.') !== reader.hostname.replace('-pooler.', '.') ||
    (curator.port || '5432') !== (reader.port || '5432') ||
    curator.pathname !== reader.pathname ||
    curator.username === reader.username
  )
    throw new Error('REVIEWER_CORPUS_DEDICATED_CONNECTION_REQUIRED');
  curator.searchParams.delete('sslmode');
  curator.searchParams.delete('channel_binding');
  return {
    connectionString: curator.toString(),
    ssl: databaseTls(environment.REVIEWER_CORPUS_TLS_MODE || 'verify-full', environment, {
      ca: environment.REVIEWER_CORPUS_CA_CERT,
    }),
    max: 1,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30_000,
  };
}

export async function initializeReviewerCorpus(environment: NodeJS.ProcessEnv) {
  const connection = reviewerCorpusConnection(environment);
  if (!connection) return undefined;
  const corpusVersion = reviewerCorpusVersion(environment);
  if (!corpusVersion) throw new Error('REVIEWER_CORPUS_VERSION_REQUIRED');
  const pool = new Pool(connection);
  try {
    const result = await pool.query<{ scoped: boolean }>(
      `select has_function_privilege(current_user,
        'basirah_api.approve_editorial_source(text,text,text,text,text,jsonb)', 'EXECUTE')
        and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='basirah' and c.relname in ('passage','source_edition')
          and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE'))
        and not pg_has_role(current_user,'basirah_research_runtime','MEMBER')
        and not pg_has_role(current_user,'basirah_runtime','MEMBER') as scoped`,
    );
    if (!result.rows[0]?.scoped) throw new Error('REVIEWER_CORPUS_LEAST_PRIVILEGE_REQUIRED');
    return { store: createReviewerCorpus(pool, corpusVersion), close: () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

/** Approved additions never change the frozen submission snapshot. */
export function reviewerCorpusVersion(environment: NodeJS.ProcessEnv): string | undefined {
  const version = environment.REVIEWER_CORPUS_VERSION?.trim();
  if (!version) return undefined;
  if (
    !/^[a-f0-9]{64}$/u.test(environment.FOUNDATION_CORPUS_VERSION ?? '') ||
    version !== `reviewed-${environment.FOUNDATION_CORPUS_VERSION}`
  )
    throw new Error('REVIEWER_CORPUS_OVERLAY_INVALID');
  return version;
}

export type ReviewerCorpus = {
  approve(input: {
    actor: string;
    ticketCode: string;
    version: number;
    source: EditorialReview['evidence'][number];
    rightsRecord: string;
    supportingEvidence?: EditorialReview['evidence'];
  }): Promise<{ snapshotKey: string }>;
};
export function createReviewerCorpus(
  pool: Pick<Pool, 'query'>,
  corpusVersion: string,
): ReviewerCorpus {
  if (!corpusVersion.trim()) throw new Error('REVIEWER_CORPUS_VERSION_REQUIRED');
  return {
    async approve(input) {
      const source = input.source;
      if (
        !['hadith_matn', 'book_excerpt', 'scholar_explanation', 'reviewer_commentary'].includes(
          source.sourceRole,
        ) ||
        !source.edition.trim() ||
        !source.author.trim() ||
        !source.sourceUrl.startsWith('https:') ||
        source.reference.length > 300
      )
        throw new Error('REVIEWED_SOURCE_PROVENANCE_REQUIRED');
      const fingerprint = sha256(
        JSON.stringify([
          source.work,
          source.author,
          source.edition,
          source.reference,
          source.sourceUrl,
          source.originalText,
          input.rightsRecord,
          ...(source.sourceRole === 'reviewer_commentary' ? [input.supportingEvidence ?? []] : []),
        ]),
      );
      const key = `reviewed-${fingerprint.slice(0, 32)}`;
      const result = await pool.query<{ value: { snapshotKey: string } }>(
        'select basirah_api.approve_editorial_source($1,$2,$3,$4,$5,$6::jsonb) as value',
        [
          key,
          corpusVersion,
          normalizeCorpusSearch(source.originalText),
          sha256(source.originalText),
          input.actor,
          JSON.stringify({
            ...source,
            rightsRecord: input.rightsRecord,
            ticketCode: input.ticketCode,
            reviewVersion: input.version,
            ...(source.sourceRole === 'reviewer_commentary'
              ? {
                  supportingEvidence: input.supportingEvidence ?? [],
                  supportingContext: supportingContext(input.supportingEvidence ?? []),
                }
              : {}),
          }),
        ],
      );
      if (!result.rows[0]?.value) throw new Error('REVIEWED_SOURCE_SAVE_FAILED');
      return result.rows[0].value;
    },
  };
}

function supportingContext(sources: EditorialReview['evidence']) {
  const text = sources
    .map(
      (source) =>
        `${source.work} — ${source.reference}\n${source.sourceUrl}\n${source.originalText}`,
    )
    .join('\n\n');
  return text.length <= 30000
    ? text
    : `${text.slice(0, 29500)}\n[سياق المصادر مقتطع؛ الأصول الكاملة محفوظة مع إجابة المراجع.]`;
}
