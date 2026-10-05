import type { Pool, PoolClient } from 'pg';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import type { LoadedSourcePolicy } from './source-policy.js';
import { canonical, sha256 } from './foundation.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import { eligibleResearchPage } from './research-page-cache.js';
import { QUERY_EMBEDDING_MODEL, QUERY_EMBEDDING_DIMENSIONS } from './query-embedding.js';
import {
  cachePassages,
  passageHint,
  CACHE_CHUNKER_VERSION,
  CACHE_PASSAGE_REPRESENTATION,
} from './research-page-passages.js';

const validVector = (v: number[]) =>
  v.length === QUERY_EMBEDDING_DIMENSIONS && v.every(Number.isFinite) && v.some((n) => n !== 0);
export function createResearchPagePassageIndex(options: {
  readerPool: Pool;
  writerPool?: Pool;
  policy: LoadedSourcePolicy;
  embed?: (text: string, signal?: AbortSignal) => Promise<number[]>;
}) {
  const policy = structuredClone(options.policy);
  async function tx<T>(
    write: boolean,
    operation: (c: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const pool = write ? options.writerPool : options.readerPool;
    if (!pool) throw Error('CACHE_PASSAGE_WRITER_REQUIRED');
    const c = await pool.connect();
    try {
      signal?.throwIfAborted();
      await c.query(write ? 'begin' : 'begin read only');
      await c.query(
        'set local role ' + (write ? 'basirah_cache_writer' : 'basirah_research_runtime'),
      );
      await c.query("set local statement_timeout='" + (write ? '5000' : '1000') + "ms'");
      const result = await operation(c);
      signal?.throwIfAborted();
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
  function parent(row: Record<string, unknown>) {
    const e = SourceEvidenceSchema.parse(row.evidence);
    if (
      !e.snapshotKey.startsWith('web-cache:') ||
      sha256(e.originalText) !== e.originalSha256 ||
      !eligibleResearchPage(e, policy)
    )
      throw Error('CACHE_PASSAGE_PARENT_INELIGIBLE');
    return e;
  }
  async function retained(keys: readonly string[], write: boolean, signal?: AbortSignal) {
    const selected = [...new Set(keys)];
    if (
      !selected.length ||
      selected.length > 8 ||
      selected.some((k) => !k.startsWith('web-cache:'))
    )
      throw Error('CACHE_PASSAGE_BATCH_INVALID');
    const rows = await tx(
      write,
      async (c) =>
        (
          await c.query(
            'select evidence from basirah.research_page_cache where snapshot_key=any($1::text[]) and policy_sha256=$2 and revoked_at is null and expires_at>clock_timestamp() order by snapshot_key',
            [selected, policy.sha256],
          )
        ).rows,
      signal,
    );
    if (rows.length !== selected.length) throw Error('CACHE_PASSAGE_PARENT_UNAVAILABLE');
    return rows.map(parent);
  }
  return {
    /** Read-only deterministic preparation, no classification, acquisition, writes or embeddings. */
    async plan(keys: readonly string[], signal?: AbortSignal) {
      const originals = await retained(keys, false, signal);
      return originals.map((e) => ({
        parentSnapshotKey: e.snapshotKey,
        originalSha256: e.originalSha256,
        sourceUrl: e.sourceUrl,
        ...cachePassages(e),
      }));
    },
    /** Explicit offline job only. Metadata/vector writes are idempotent and insert-only. */
    async backfill(
      keys: readonly string[],
      limits: { maxEmbeddings: number; timeoutMs: number },
      external?: AbortSignal,
    ) {
      if (
        !Number.isInteger(limits.maxEmbeddings) ||
        limits.maxEmbeddings < 0 ||
        limits.maxEmbeddings > 256 ||
        !Number.isInteger(limits.timeoutMs) ||
        limits.timeoutMs < 1000 ||
        limits.timeoutMs > 120000
      )
        throw Error('CACHE_PASSAGE_BATCH_INVALID');
      const signal = AbortSignal.any([
        AbortSignal.timeout(limits.timeoutMs),
        ...(external ? [external] : []),
      ]);
      const originals = await retained(keys, true, signal);
      let attemptedEmbeddings = 0,
        insertedEmbeddings = 0;
      const results: Array<{
        parentSnapshotKey: string;
        coverage: ReturnType<typeof cachePassages>['coverage'];
        availableEmbeddings: number;
        failureCodes: string[];
      }> = [];
      for (const e of originals) {
        signal.throwIfAborted();
        const built = cachePassages(e),
          failureCodes: string[] = [];
        await tx(
          true,
          async (c) => {
            for (const p of built.passages)
              await c.query(
                `insert into basirah.research_page_passage(passage_id,parent_snapshot_key,parent_sha256,policy_sha256,chunker_version,start_utf16,end_utf16,core_start_utf16,core_end_utf16,start_codepoint,end_codepoint,core_start_codepoint,core_end_codepoint,original_text,passage_sha256,context_truncated,boundary_truncated,coverage,search_text) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19) on conflict do nothing`,
                [
                  p.passageId,
                  e.snapshotKey,
                  e.originalSha256,
                  policy.sha256,
                  CACHE_CHUNKER_VERSION,
                  p.startOffset,
                  p.endOffset,
                  p.coreStart,
                  p.coreEnd,
                  p.codePointStart,
                  p.codePointEnd,
                  p.codePointCoreStart,
                  p.codePointCoreEnd,
                  p.originalText,
                  p.passageSha256,
                  p.contextTruncated,
                  p.boundaryTruncated,
                  JSON.stringify(built.coverage),
                  normalizeCorpusSearch(p.originalText),
                ],
              );
            // A conflicting record must be the exact immutable representation, not merely the same key.
            const rows = (
              await c.query(
                'select * from basirah.research_page_passage where parent_snapshot_key=$1 and chunker_version=$2 order by core_start_utf16',
                [e.snapshotKey, CACHE_CHUNKER_VERSION],
              )
            ).rows;
            if (
              rows.length !== built.passages.length ||
              rows.some((r, i) => !bound(r, built.passages[i]!, built.coverage))
            )
              throw Error('CACHE_PASSAGE_IDENTITY_COLLISION');
          },
          signal,
        );
        const existing = new Set<string>(
          await tx(
            true,
            async (c) =>
              (
                await c.query(
                  'select v.passage_id from basirah.research_page_passage_embedding v join basirah.research_page_passage p on p.passage_id=v.passage_id where p.parent_snapshot_key=$1 and p.chunker_version=$2 and v.model_id=$3 and v.dimensions=$4 and v.representation=$5',
                  [
                    e.snapshotKey,
                    CACHE_CHUNKER_VERSION,
                    QUERY_EMBEDDING_MODEL,
                    QUERY_EMBEDDING_DIMENSIONS,
                    CACHE_PASSAGE_REPRESENTATION,
                  ],
                )
              ).rows.map((r) => String(r.passage_id)),
            signal,
          ),
        );
        for (const p of built.passages) {
          signal.throwIfAborted();
          if (existing.has(p.passageId)) continue;
          if (!options.embed) {
            failureCodes.push('embedding_disabled');
            break;
          }
          if (attemptedEmbeddings >= limits.maxEmbeddings) {
            failureCodes.push('embedding_budget_skipped');
            break;
          }
          attemptedEmbeddings++;
          let vector: number[];
          try {
            // Bound uncooperative providers without detaching any SQL write.
            let abort: (() => void) | undefined;
            try {
              vector = await new Promise<number[]>((resolve, reject) => {
                abort = () => reject(Error('CACHE_PASSAGE_EMBEDDING_CANCELLED'));
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) {
                  abort();
                  return;
                }
                Promise.resolve()
                  .then(() => options.embed!(p.originalText, signal))
                  .then(resolve, reject);
              });
            } finally {
              if (abort) signal.removeEventListener('abort', abort);
            }
            if (!validVector(vector)) throw Error('CACHE_PASSAGE_VECTOR_INVALID');
          } catch {
            signal.throwIfAborted();
            failureCodes.push('embedding_unavailable');
            continue;
          }
          const inserted = await tx(
            true,
            async (c) =>
              (
                await c.query(
                  `insert into basirah.research_page_passage_embedding(passage_id,model_id,dimensions,representation,input_sha256,embedding) values($1,$2,$3,$4,$5,$6::vector) on conflict do nothing returning passage_id`,
                  [
                    p.passageId,
                    QUERY_EMBEDDING_MODEL,
                    QUERY_EMBEDDING_DIMENSIONS,
                    CACHE_PASSAGE_REPRESENTATION,
                    p.passageSha256,
                    '[' + vector.join(',') + ']',
                  ],
                )
              ).rows.length,
            signal,
          );
          insertedEmbeddings += inserted;
          existing.add(p.passageId);
        }
        results.push({
          parentSnapshotKey: e.snapshotKey,
          coverage: built.coverage,
          availableEmbeddings: existing.size,
          failureCodes: [...new Set(failureCodes)],
        });
      }
      return {
        chunkerVersion: CACHE_CHUNKER_VERSION,
        modelId: QUERY_EMBEDDING_MODEL,
        dimensions: QUERY_EMBEDDING_DIMENSIONS,
        representation: CACHE_PASSAGE_REPRESENTATION,
        attemptedEmbeddings,
        insertedEmbeddings,
        results,
      };
    },
    async search(
      query: string,
      vector: number[] | null,
      signal?: AbortSignal,
      mode: 'lexical' | 'semantic' | 'hybrid' = 'hybrid',
    ): Promise<SourceEvidence[]> {
      const text = normalizeCorpusSearch(query);
      if (!text) return [];
      if (vector && !validVector(vector)) throw Error('CACHE_PASSAGE_VECTOR_INVALID');
      const rows = await tx(
        false,
        async (c) =>
          (
            await c.query(
              `with scores as (
          select p.*,c.evidence,word_similarity($2,p.search_text) lexical_score,
            case when $3::vector is not null and v.embedding is not null then 1-(v.embedding<=>$3::vector) else 0 end dense_score
          from basirah.research_page_passage p join basirah.research_page_cache c on c.snapshot_key=p.parent_snapshot_key
          left join basirah.research_page_passage_embedding v on v.passage_id=p.passage_id and v.model_id=$5 and v.dimensions=1536 and v.representation=$6
          where p.policy_sha256=$1 and c.policy_sha256=$1 and p.parent_sha256=c.original_sha256 and p.chunker_version=$4 and c.revoked_at is null and c.expires_at>clock_timestamp()
        ), ranked as (
          select *,($7<>'semantic' and lexical_score>0.05) lexical_hit,($7<>'lexical' and dense_score>0.2) semantic_hit,
            case when $7<>'semantic' and lexical_score>0.05 then 1.0/(60+row_number() over(order by lexical_score desc,passage_id)) else 0 end +
            case when $7<>'lexical' and dense_score>0.2 then 1.0/(60+row_number() over(order by dense_score desc,passage_id)) else 0 end fusion_score from scores
        ), parents as (select *,row_number() over(partition by parent_snapshot_key order by fusion_score desc,passage_id) parent_rank from ranked where lexical_hit or semantic_hit)
        select * from parents where parent_rank<=3 order by fusion_score desc,parent_snapshot_key,passage_id limit 24`,
              [
                policy.sha256,
                text,
                vector ? '[' + vector.join(',') + ']' : null,
                CACHE_CHUNKER_VERSION,
                QUERY_EMBEDDING_MODEL,
                CACHE_PASSAGE_REPRESENTATION,
                mode,
              ],
            )
          ).rows,
        signal,
      );
      const selected = new Map<
        string,
        { source: SourceEvidence; built: ReturnType<typeof cachePassages> }
      >();
      for (const row of rows) {
        const e = parent(row);
        let prior = selected.get(e.snapshotKey);
        if (!prior) {
          if (selected.size === 8) continue;
          const built = cachePassages(e);
          prior = {
            source: {
              ...e,
              delivery: 'snapshot',
              retrievalModes: [],
              provenance: {
                ...e.provenance,
                cachePassageHits: [],
                cachePassageQuerySha256: sha256(query),
                passageIndexCoverage: built.coverage,
              },
            },
            built,
          };
          selected.set(e.snapshotKey, prior);
        }
        const p = prior.built.passages.find((p) => p.passageId === row.passage_id);
        if (!p || !bound(row, p, prior.built.coverage))
          throw Error('CACHE_PASSAGE_BINDING_INVALID');
        const hits = prior.source.provenance.cachePassageHits as ReturnType<typeof passageHint>[];
        if (hits.length < 3 && !hits.some((h) => h.passageId === p.passageId))
          hits.push(passageHint(p));
        if (row.lexical_hit && !prior.source.retrievalModes.includes('lexical'))
          prior.source.retrievalModes.push('lexical');
        if (row.semantic_hit && !prior.source.retrievalModes.includes('semantic'))
          prior.source.retrievalModes.push('semantic');
      }
      return [...selected.values()].map((p) => p.source);
    },
  };
}
function bound(
  row: Record<string, unknown>,
  p: ReturnType<typeof cachePassages>['passages'][number],
  coverage: ReturnType<typeof cachePassages>['coverage'],
) {
  return (
    row.passage_id === p.passageId &&
    row.parent_snapshot_key === p.parentSnapshotKey &&
    row.parent_sha256 === p.originalSha256 &&
    row.chunker_version === p.chunkerVersion &&
    row.start_utf16 === p.startOffset &&
    row.end_utf16 === p.endOffset &&
    row.core_start_utf16 === p.coreStart &&
    row.core_end_utf16 === p.coreEnd &&
    row.start_codepoint === p.codePointStart &&
    row.end_codepoint === p.codePointEnd &&
    row.core_start_codepoint === p.codePointCoreStart &&
    row.core_end_codepoint === p.codePointCoreEnd &&
    row.original_text === p.originalText &&
    row.passage_sha256 === p.passageSha256 &&
    row.context_truncated === p.contextTruncated &&
    row.boundary_truncated === p.boundaryTruncated &&
    canonical(row.coverage) === canonical(coverage)
  );
}
