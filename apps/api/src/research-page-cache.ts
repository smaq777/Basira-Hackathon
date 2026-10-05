import {
  CacheSearchDiagnosticsSchema,
  type CacheSearchDiagnostics,
} from '../../../packages/contracts/src/semantic-assessment.js';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { sha256, canonical } from './foundation.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import type { LoadedSourcePolicy } from './source-policy.js';
import { allowedWebUrl } from './web-discovery.js';
import { sourceExtractionFailure } from './source-extraction-quality.js';
import { SourceContentSelectionSchema } from '../../../packages/contracts/src/source-content.js';

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
    contentSelection: SourceContentSelectionSchema.optional(),
    contentViewStatus: z
      .enum(['selected', 'original_retained_no_removal', 'original_retained_invalid_labels'])
      .optional(),
  })
  .strict()
  .refine((row) => {
    const view = row.contentSelection;
    if (!view)
      return (
        row.contentViewStatus === undefined ||
        row.contentViewStatus === 'original_retained_invalid_labels'
      );
    return (
      (row.contentViewStatus === 'selected' ||
        row.contentViewStatus === 'original_retained_no_removal') &&
      (row.contentViewStatus === 'selected') === view.removedBlocks.length > 0 &&
      view.modelId === row.modelId &&
      view.promptVersion === row.promptVersion &&
      view.requestSha256 === row.requestSha256 &&
      view.responseSha256 === row.responseSha256
    );
  });
export type PageClassification = z.infer<typeof PageClassificationSchema>;
export type ResearchPageCache = {
  store(
    evidence: readonly SourceEvidence[],
    signal?: AbortSignal,
  ): Promise<{ storedKeys: string[]; failureCodes: string[] }>;
  search(query: string, signal?: AbortSignal): Promise<SourceEvidence[]>;
  searchWithDiagnostics?(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ evidence: SourceEvidence[]; diagnostics: CacheSearchDiagnostics }>;
  restore(keys: readonly string[], signal?: AbortSignal): Promise<SourceEvidence[]>;
};
export function eligibleResearchPage(e: SourceEvidence, policy: LoadedSourcePolicy) {
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
  passageIndex?: {
    search(query: string, vector: number[] | null, signal?: AbortSignal): Promise<SourceEvidence[]>;
  };
  contentViews?: {
    store(
      source: SourceEvidence,
      selection: z.infer<typeof SourceContentSelectionSchema>,
      signal?: AbortSignal,
    ): Promise<unknown>;
    enrich(
      sources: readonly SourceEvidence[],
      query: string,
      signal?: AbortSignal,
    ): Promise<SourceEvidence[]>;
  };
  queryEmbeddingTimeoutMs?: number;
  statementTimeoutMs?: number;
  ttlMs?: number;
  now?: () => number;
}): ResearchPageCache {
  const policy = structuredClone(options.policy),
    now = options.now ?? Date.now;
  const embeddingTimeoutMs = options.queryEmbeddingTimeoutMs ?? 1500;
  const statementTimeoutMs = options.statementTimeoutMs ?? 5000;
  if (
    !Number.isInteger(embeddingTimeoutMs) ||
    embeddingTimeoutMs < 1 ||
    embeddingTimeoutMs > 8000 ||
    !Number.isInteger(statementTimeoutMs) ||
    statementTimeoutMs < 1 ||
    statementTimeoutMs > 10000
  )
    throw Error('CACHE_SEARCH_BUDGET_INVALID');
  const ttl = options.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(ttl) || ttl < 60000 || ttl > 30 * 24 * 60 * 60 * 1000)
    throw Error('CACHE_TTL_INVALID');
  function eligible(e: SourceEvidence) {
    return eligibleResearchPage(e, policy);
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
      await client.query("set local statement_timeout='" + statementTimeoutMs + "ms'");
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
  async function searchDetailed(
    query: string,
    signal?: AbortSignal,
  ): Promise<{
    evidence: SourceEvidence[];
    diagnostics: CacheSearchDiagnostics;
    unavailableError?: unknown;
  }> {
    const started = Date.now();
    const diagnostics: CacheSearchDiagnostics = {
      outcome: 'success',
      elapsedMs: 0,
      parentCandidateCount: 0,
      stages: {
        embedding: 'disabled',
        pages: 'disabled',
        passages: 'disabled',
        content: 'disabled',
      },
      failureCodes: [],
    };
    const done = (evidence: SourceEvidence[], unavailable = false, unavailableError?: unknown) => ({
      evidence,
      ...(unavailable ? { unavailableError } : {}),
      diagnostics: CacheSearchDiagnosticsSchema.parse({
        ...diagnostics,
        outcome: unavailable
          ? 'unavailable'
          : diagnostics.failureCodes.length
            ? 'partial'
            : 'success',
        elapsedMs: Math.min(240000, Math.max(0, Date.now() - started)),
        parentCandidateCount: evidence.length,
      }),
    });
    signal?.throwIfAborted();
    const text = normalizeCorpusSearch(query);
    if (!text) return done([]);
    let vector: number[] | null = null;
    if (options.embeddingSpace) {
      // This per-call embedding ceiling leaves the remaining cache budget for SQL.
      const budget = new AbortController();
      const embeddingSignal = AbortSignal.any([budget.signal, ...(signal ? [signal] : [])]);
      let embeddingTimedOut = false;
      const timer = setTimeout(() => {
        embeddingTimedOut = true;
        budget.abort();
      }, embeddingTimeoutMs);
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
        diagnostics.stages!.embedding = 'success';
      } catch {
        signal?.throwIfAborted();
        diagnostics.stages!.embedding = embeddingTimedOut ? 'timeout' : 'unavailable';
        diagnostics.failureCodes.push(
          embeddingTimedOut ? 'embedding_timeout' : 'embedding_unavailable',
        );
      } finally {
        clearTimeout(timer);
        if (abort) embeddingSignal.removeEventListener('abort', abort);
      }
    }
    if (
      vector &&
      (vector.length !== 1536 ||
        vector.some((v) => !Number.isFinite(v)) ||
        vector.every((v) => v === 0))
    ) {
      vector = null;
      diagnostics.stages!.embedding = 'invalid';
      diagnostics.failureCodes.push('embedding_invalid');
    }
    const [pages, passages] = await Promise.allSettled([
      tx(
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
      ),
      options.passageIndex
        ? options.passageIndex.search(query, vector, signal)
        : Promise.resolve([]),
    ]);
    signal?.throwIfAborted();
    diagnostics.stages!.pages = pages.status === 'fulfilled' ? 'success' : 'unavailable';
    diagnostics.stages!.passages = options.passageIndex
      ? passages.status === 'fulfilled'
        ? 'success'
        : 'unavailable'
      : 'disabled';
    if (passages.status === 'rejected') diagnostics.failureCodes.push('passages_unavailable');
    if (pages.status === 'rejected') {
      diagnostics.failureCodes.push('pages_unavailable');
      return done([], true, pages.reason);
    }
    const rows = passages.status === 'fulfilled' ? passages.value : [];
    const merged = new Map<string, SourceEvidence>();
    // A partially populated passage index enriches context, but cannot displace
    // the established parent ranking. Passage-only parents fill vacancies only.
    for (const row of [...pages.value, ...rows]) {
      const prior = merged.get(row.snapshotKey);
      if (!prior) {
        if (merged.size < 8) merged.set(row.snapshotKey, row);
      } else if (
        prior.originalSha256 === row.originalSha256 &&
        prior.originalText === row.originalText &&
        prior.sourceUrl === row.sourceUrl &&
        prior.sourceId === row.sourceId &&
        prior.sourceVersion === row.sourceVersion
      )
        merged.set(row.snapshotKey, {
          ...prior,
          retrievalModes: [...new Set([...prior.retrievalModes, ...row.retrievalModes])],
          provenance: {
            ...prior.provenance,
            ...Object.fromEntries(
              Object.entries(row.provenance).filter(([key]) =>
                ['cachePassageHits', 'cachePassageQuerySha256', 'passageIndexCoverage'].includes(
                  key,
                ),
              ),
            ),
          },
        });
    }
    const results = [...merged.values()].slice(0, 8).map((row) =>
      passages.status === 'rejected'
        ? {
            ...row,
            provenance: {
              ...row.provenance,
              passageIndexStatus: 'unavailable_legacy_fallback',
            },
          }
        : row,
    );
    if (!options.contentViews) return done(results);
    try {
      const enriched = await options.contentViews.enrich(results, query, signal);
      if (
        enriched.length !== results.length ||
        enriched.some(
          (e, i) =>
            e.snapshotKey !== results[i]!.snapshotKey ||
            e.originalSha256 !== results[i]!.originalSha256 ||
            e.originalText !== results[i]!.originalText ||
            e.sourceUrl !== results[i]!.sourceUrl ||
            canonical(
              Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'provenance')),
            ) !==
              canonical(
                Object.fromEntries(
                  Object.entries(results[i]!).filter(([key]) => key !== 'provenance'),
                ),
              ),
        )
      )
        throw Error('SOURCE_CONTENT_PARENT_RANK_CHANGED');
      diagnostics.stages!.content = 'success';
      return done(enriched);
    } catch {
      signal?.throwIfAborted();
      diagnostics.stages!.content = 'unavailable';
      diagnostics.failureCodes.push('content_unavailable');
      return done(
        results.map((row) => ({
          ...row,
          provenance: {
            ...row.provenance,
            sourceContentViewStatus: 'unavailable_original_fallback',
          },
        })),
      );
    }
  }

  return {
    async store(inputs, signal) {
      const storedKeys: string[] = [];
      const failureCodes: string[] = [];
      for (const input of inputs) {
        signal?.throwIfAborted();
        const e = SourceEvidenceSchema.parse(input);
        if (
          [
            'cachePassageHits',
            'cachePassageQuerySha256',
            'cachePassageHitsByQuery',
            'passageIndexCoverage',
            'passageIndexStatus',
            'sourceContentSelection',
            'sourceContentViewStatus',
          ].some((k) => Object.hasOwn(e.provenance, k))
        )
          throw Error('CACHE_TRANSIENT_PROVENANCE_FORBIDDEN');
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
        const { contentSelection, contentViewStatus, ...topicClassification } = classification;
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
            topicClassification,
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
                JSON.stringify(topicClassification),
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
        if (options.contentViews && contentViewStatus && contentViewStatus !== 'selected')
          failureCodes.push('cache_content_view_' + contentViewStatus);
        if (options.contentViews && contentSelection) {
          try {
            await options.contentViews.store(frozen, contentSelection, signal);
          } catch {
            signal?.throwIfAborted();
            failureCodes.push('cache_content_view_unavailable');
          }
        }
      }
      return { storedKeys, failureCodes };
    },
    async searchWithDiagnostics(query, signal) {
      const { evidence, diagnostics } = await searchDetailed(query, signal);
      return { evidence, diagnostics };
    },
    async search(query, signal) {
      const result = await searchDetailed(query, signal);
      if (result.diagnostics.outcome === 'unavailable')
        throw result.unavailableError ?? Error('CACHE_SEARCH_UNAVAILABLE');
      return result.evidence;
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
