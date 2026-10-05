import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import type { LoadedSourcePolicy } from './source-policy.js';
import { allowedWebUrl } from './web-discovery.js';
import { sourceExtractionFailure } from './source-extraction-quality.js';

export const ResearchTopicSchema = z.enum([
  'aqidah',
  'worship',
  'ethics',
  'family',
  'transactions',
  'quran_exegesis',
  'hadith_studies',
  'biography',
  'other',
]);
export const PageClassificationSchema = z
  .object({
    topics: z.array(ResearchTopicSchema).min(1).max(5),
    modelId: z.string().min(1).max(160),
    promptVersion: z.string().min(1).max(120),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type PageClassification = z.infer<typeof PageClassificationSchema>;
export type ResearchPageCache = {
  store(
    evidence: readonly SourceEvidence[],
    signal?: AbortSignal,
  ): Promise<{ storedKeys: string[]; failureCodes: string[] }>;
  search(query: string, signal?: AbortSignal): Promise<SourceEvidence[]>;
  restore(keys: readonly string[], signal?: AbortSignal): Promise<SourceEvidence[]>;
};
export function createResearchPageCache(options: {
  readerPool: Pool;
  writerPool: Pool;
  policy: LoadedSourcePolicy;
  classify: (
    page: { originalText: string; sourceUrl: string; originalSha256: string },
    signal?: AbortSignal,
  ) => Promise<PageClassification>;
  embeddingSpace?: {
    modelId: string;
    embed: (text: string, signal?: AbortSignal) => Promise<number[]>;
  };
  ttlMs?: number;
  now?: () => number;
}): ResearchPageCache {
  const policy = structuredClone(options.policy),
    now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(ttl) || ttl < 60000 || ttl > 30 * 24 * 60 * 60 * 1000)
    throw Error('CACHE_TTL_INVALID');
  function eligible(e: SourceEvidence) {
    const url = e.sourceUrl && allowedWebUrl(e.sourceUrl, policy.policies);
    const rule = url && policy.enabled.find((r) => r.domain === url.hostname);
    return (
      !!rule &&
      sourceExtractionFailure(e.sourceUrl!, e.originalText) === null &&
      e.sourceRole === rule.sourceRole &&
      e.sourceId === 'web-' + rule.id &&
      e.provenance.sourcePolicySha256 === policy.sha256 &&
      e.provenance.sourcePolicyVersion === policy.policy.policyVersion &&
      e.approvalStatus === 'pending' &&
      e.researchOnly
    );
  }
  function decode(row: Record<string, unknown>) {
    const e = SourceEvidenceSchema.parse(row.evidence);
    if (sha256(e.originalText) !== e.originalSha256) throw Error('CACHE_ORIGINAL_HASH_MISMATCH');
    return e;
  }
  async function tx<T>(
    pool: Pool,
    role: string,
    readOnly: boolean,
    fn: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const client = await pool.connect();
    try {
      signal?.throwIfAborted();
      await client.query(readOnly ? 'begin read only' : 'begin');
      await client.query('set local role ' + role);
      await client.query("set local statement_timeout='5000ms'");
      const value = await fn(client);
      signal?.throwIfAborted();
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async store(inputs, signal) {
      const storedKeys: string[] = [];
      for (const input of inputs) {
        signal?.throwIfAborted();
        const e = SourceEvidenceSchema.parse(input);
        if (
          !eligible(e) ||
          !e.snapshotKey.startsWith('web:') ||
          e.originalText.length > 30000 ||
          sha256(e.originalText) !== e.originalSha256
        )
          throw Error('CACHE_SOURCE_INELIGIBLE');
        const key =
          'web-cache:' + sha256(e.sourceUrl + ':' + e.originalSha256 + ':' + policy.sha256);
        const exists = await tx(
          options.writerPool,
          'basirah_cache_writer',
          false,
          async (c) =>
            (
              await c.query(
                'select evidence from basirah.research_page_cache where snapshot_key=$1 and policy_sha256=$2 and revoked_at is null',
                [key, policy.sha256],
              )
            ).rows[0],
          signal,
        );
        if (exists) {
          const prior = SourceEvidenceSchema.parse(exists.evidence);
          if (prior.originalText !== e.originalText) throw Error('CACHE_IDENTITY_COLLISION');
          await tx(
            options.writerPool,
            'basirah_cache_writer',
            false,
            async (c) => {
              await c.query(
                'update basirah.research_page_cache set last_verified_at=clock_timestamp(),expires_at=greatest(expires_at,$2::timestamptz) where snapshot_key=$1 and revoked_at is null',
                [key, new Date(now() + ttl)],
              );
            },
            signal,
          );
          storedKeys.push(key);
          continue;
        }
        const classification = PageClassificationSchema.parse(
          await options.classify(
            {
              originalText: e.originalText,
              sourceUrl: e.sourceUrl!,
              originalSha256: e.originalSha256,
            },
            signal,
          ),
        );
        if (new Set(classification.topics).size !== classification.topics.length)
          throw Error('CACHE_DUPLICATE_TOPIC');
        const heading = (
          e.reference +
          '\nTopics: ' +
          classification.topics.join(', ') +
          '\n'
        ).slice(0, 500);
        const bodyLimit = 3000 - heading.length;
        const embeddingText =
          heading +
          (e.originalText.length <= bodyLimit
            ? e.originalText
            : e.originalText.slice(0, Math.floor(bodyLimit / 2)) +
              '\n' +
              e.originalText.slice(-(bodyLimit - Math.floor(bodyLimit / 2) - 1)));
        let vector: number[] | null = null;
        let embeddingStatus = 'disabled';
        if (options.embeddingSpace) {
          try {
            vector = await options.embeddingSpace.embed(embeddingText, signal);
            embeddingStatus = 'available';
          } catch {
            signal?.throwIfAborted();
            embeddingStatus = 'unavailable';
          }
        }
        if (vector && (vector.length !== 1536 || vector.some((v) => !Number.isFinite(v))))
          throw Error('CACHE_EMBEDDING_INVALID');
        // Only public-page provenance goes into shared storage; no draft, claim, or search query.
        const provenance: Record<string, unknown> = {};
        for (const name of [
          'provider',
          'representation',
          'acquiredAt',
          'requestedUrl',
          'sourcePolicyVersion',
          'sourcePolicySha256',
          'sourceEligibilityBasis',
          'referenceDocument',
          'attributionStatus',
          'rightsStatus',
          'scholarlyApproval',
          'sourceApprovalMeaning',
          'originMetadataStatus',
        ])
          if (e.provenance[name] !== undefined) provenance[name] = e.provenance[name];
        const frozen = SourceEvidenceSchema.parse({
          snapshotKey: key,
          sourceId: e.sourceId,
          sourceVersion: e.sourceVersion,
          sourceRole: e.sourceRole,
          reference: e.reference,
          originalText: e.originalText,
          originalSha256: e.originalSha256,
          work: e.work,
          author: e.author,
          edition: e.edition,
          sourceUrl: e.sourceUrl,
          approvalStatus: 'pending',
          researchOnly: true,
          parentSnapshotKey: null,
          delivery: 'snapshot',
          retrievalModes: ['lexical'],
          provenance: {
            ...provenance,
            cacheKind: 'public_research_page',
            topics: classification.topics,
            topicClassification: classification,
            machineLabelsOnly: true,
            scholarlyApproval: false,
            embeddingStatus,
            ...(vector
              ? {
                  embeddingView: {
                    method: 'title_topics_head_tail_v1',
                    inputSha256: sha256(embeddingText),
                    characters: embeddingText.length,
                    modelId: options.embeddingSpace!.modelId,
                    dimensions: 1536,
                    fullTextSemanticCoverage: e.originalText.length <= bodyLimit,
                  },
                }
              : {}),
          },
        });
        await tx(
          options.writerPool,
          'basirah_cache_writer',
          false,
          async (c) => {
            const inserted = await c.query(
              `insert into basirah.research_page_cache(snapshot_key,source_url,original_sha256,policy_sha256,evidence,topics,classification,search_text,embedding,embedding_model,expires_at) values($1,$2,$3,$4,$5::jsonb,$6::text[],$7::jsonb,$8,$9::vector,$10,$11) on conflict do nothing returning snapshot_key`,
              [
                key,
                e.sourceUrl,
                e.originalSha256,
                policy.sha256,
                JSON.stringify(frozen),
                classification.topics,
                JSON.stringify(classification),
                normalizeCorpusSearch(e.originalText),
                vector ? '[' + vector.join(',') + ']' : null,
                vector ? options.embeddingSpace!.modelId : null,
                new Date(now() + ttl),
              ],
            );
            if (!inserted.rows.length) {
              const row = (
                await c.query(
                  'select evidence from basirah.research_page_cache where snapshot_key=$1 and revoked_at is null',
                  [key],
                )
              ).rows[0];
              if (!row || SourceEvidenceSchema.parse(row.evidence).originalText !== e.originalText)
                throw Error('CACHE_IDENTITY_COLLISION');
            }
          },
          signal,
        );
        storedKeys.push(key);
      }
      return { storedKeys, failureCodes: [] };
    },
    async search(query, signal) {
      signal?.throwIfAborted();
      const text = normalizeCorpusSearch(query);
      if (!text) return [];
      let vector: number[] | null = null;
      if (options.embeddingSpace) {
        // Leave time for lexical SQL inside the caller's three-second cache window.
        const budget = new AbortController();
        const embeddingSignal = AbortSignal.any([budget.signal, ...(signal ? [signal] : [])]);
        const timer = setTimeout(() => budget.abort(), 1500);
        let abort: (() => void) | undefined;
        try {
          vector = await new Promise<number[]>((resolve, reject) => {
            abort = () => reject(new Error('CACHE_QUERY_EMBEDDING_TIMEOUT_OR_CANCELLED'));
            embeddingSignal.addEventListener('abort', abort, { once: true });
            if (embeddingSignal.aborted) {
              abort();
              return;
            }
            // Both handlers remain attached if an uncooperative provider settles late.
            Promise.resolve()
              .then(() => options.embeddingSpace!.embed(query.slice(0, 3000), embeddingSignal))
              .then(resolve, reject);
          });
        } catch {
          signal?.throwIfAborted();
        } finally {
          clearTimeout(timer);
          if (abort) embeddingSignal.removeEventListener('abort', abort);
        }
      }
      if (vector && (vector.length !== 1536 || vector.some((v) => !Number.isFinite(v))))
        throw Error('CACHE_EMBEDDING_INVALID');
      return tx(
        options.readerPool,
        'basirah_research_runtime',
        true,
        async (c) => {
          const rows = (
            await c.query(
              `select evidence,word_similarity($2,search_text)>0.05 lexical_hit,($3::vector is not null and embedding_model=$4 and embedding is not null and 1-(embedding<=>$3::vector)>0.2) semantic_hit from basirah.research_page_cache where policy_sha256=$1 and expires_at>clock_timestamp() and revoked_at is null and (word_similarity($2,search_text)>0.05 or ($3::vector is not null and embedding_model=$4 and embedding is not null and 1-(embedding<=>$3::vector)>0.2)) order by greatest(word_similarity($2,search_text),case when embedding_model=$4 then 1-(embedding<=>$3::vector) else 0 end) desc,snapshot_key limit 8`,
              [
                policy.sha256,
                text,
                vector ? '[' + vector.join(',') + ']' : null,
                options.embeddingSpace?.modelId ?? null,
              ],
            )
          ).rows;
          return rows
            .map((r) => ({ e: decode(r), r }))
            .filter(({ e }) => eligible(e))
            .map(({ e, r }) => ({
              ...e,
              delivery: 'snapshot' as const,
              retrievalModes: [
                ...(r.lexical_hit ? ['lexical' as const] : []),
                ...(r.semantic_hit ? ['semantic' as const] : []),
              ],
            }));
        },
        signal,
      );
    },
    async restore(keys, signal) {
      signal?.throwIfAborted();
      const selected = [...new Set(keys)].filter((k) => k.startsWith('web-cache:'));
      if (!selected.length) return [];
      if (selected.length > 100) throw Error('CACHE_RESTORE_TOO_LARGE');
      return tx(
        options.readerPool,
        'basirah_research_runtime',
        true,
        async (c) => {
          const rows = (
            await c.query(
              'select evidence from basirah.research_page_cache where snapshot_key=any($1::text[]) and policy_sha256=$2 and expires_at>clock_timestamp() and revoked_at is null order by snapshot_key',
              [selected, policy.sha256],
            )
          ).rows;
          return rows.map(decode).filter(eligible);
        },
        signal,
      );
    },
  };
}
