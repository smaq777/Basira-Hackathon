import { Pool, type PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';

export function normalizeCorpusSearch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/[\p{M}ـ]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export type HostedCorpusOptions = {
  pool: Pool;
  corpusVersion: string;
  researchPreview?: boolean;
  limit?: number;
  embeddingSpace?: {
    modelId: string;
    dimensions: number;
    embedQuery: (text: string, signal?: AbortSignal) => Promise<number[]>;
  };
};
const selectRows = `select p.id::text,p.snapshot_key,p.source_role,p.corpus_version,p.stable_reference,
  p.original_text,encode(p.content_hash,'hex') original_sha256,p.provenance,p.context_before,p.context_after,p.footnotes,
  coalesce(parent.snapshot_key,(select linked.snapshot_key from basirah.passage_relation relation
    join basirah.passage linked on linked.id=relation.to_passage_id
    where relation.from_passage_id=p.id and ((p.source_role='tafsir_commentary' and relation.relation_type='comments_on' and linked.source_role='quran_text')
      or (p.source_role='tafsir_footnote' and relation.relation_type='footnote_of' and linked.source_role='tafsir_commentary'))
    order by (relation.provenance->>'source'='explicit_parent_snapshot') desc nulls last,linked.snapshot_key limit 1)) parent_snapshot_key,
  s.source_key,s.content_version,s.work_name,s.author_name,s.edition,s.source_url,s.approval_status,
  coalesce((select jsonb_agg(jsonb_build_object('targetSnapshotKey',linked.snapshot_key,'relationType',r.relation_type,'provenance',r.provenance) order by linked.snapshot_key,r.relation_type)
    from basirah.passage_relation r join basirah.passage linked on linked.id=r.to_passage_id
    where r.from_passage_id=p.id and linked.snapshot_key is not null),'[]'::jsonb) relations
  from basirah.passage p join basirah.source_edition s on s.id=p.source_edition_id
  left join basirah.passage parent on parent.id=p.parent_passage_id`;
function evidence(
  row: Record<string, unknown>,
  modes: SourceEvidence['retrievalModes'],
): SourceEvidence {
  const originalText = String(row.original_text);
  const provenance = row.provenance as Record<string, unknown>;
  if (createHash('sha256').update(originalText, 'utf8').digest('hex') !== row.original_sha256)
    throw new Error('CORPUS_HASH_MISMATCH');
  return SourceEvidenceSchema.parse({
    snapshotKey: row.snapshot_key,
    sourceId: provenance.originalSourceId ?? row.source_key,
    sourceVersion: row.content_version,
    sourceRole: row.source_role,
    reference: row.stable_reference,
    originalText,
    originalSha256: row.original_sha256,
    work: row.work_name,
    author:
      row.source_role === 'quran_text'
        ? null
        : row.author_name === 'Not recorded'
          ? null
          : row.author_name,
    edition: row.edition === 'Not recorded' ? null : row.edition,
    sourceUrl: row.source_url,
    approvalStatus: row.approval_status,
    researchOnly: row.approval_status !== 'approved',
    parentSnapshotKey: row.parent_snapshot_key,
    delivery: 'snapshot',
    retrievalModes: modes,
    provenance: row.provenance,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    footnotes: row.footnotes,
    relations: row.relations,
  });
}
/** Role-scoped corpus reader. Pending passages require the explicit development research role. */
export function createHostedCorpus(options: HostedCorpusOptions): ClaimCorpusSearch & {
  readiness(): Promise<{ ready: boolean; passages: number; embeddings: number }>;
} {
  const limit = options.limit ?? 8;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('INVALID_CORPUS_BOUND');
  const role = options.researchPreview ? 'basirah_research_runtime' : 'basirah_runtime';
  async function read<T>(
    operation: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const client = await options.pool.connect();
    try {
      await client.query('begin read only');
      await client.query(`set local role ${role}`);
      await client.query("set local statement_timeout = '8000ms'");
      const result = await operation(client);
      signal?.throwIfAborted();
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async readiness() {
      return read(async (client) => {
        const row = (
          await client.query(
            `select count(*)::int passages,
          (select count(*)::int from basirah.passage_embedding e where e.corpus_version=$1) embeddings
          from basirah.passage p where exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=p.id and membership.corpus_version=$1) and p.snapshot_key is not null and p.source_role is not null`,
            [options.corpusVersion],
          )
        ).rows[0];
        return { ready: row.passages > 0, passages: row.passages, embeddings: row.embeddings };
      });
    },
    async search(query, references, signal) {
      const normalized = normalizeCorpusSearch(query);
      if (!normalized) return [];
      const space = options.embeddingSpace;
      let vector: number[] | undefined;
      if (space) {
        try {
          vector = await space.embedQuery(query, signal);
        } catch {
          signal?.throwIfAborted();
        }
        if (
          vector &&
          (vector.length !== space.dimensions || vector.some((n) => !Number.isFinite(n)))
        )
          throw new Error('QUERY_EMBEDDING_SPACE_MISMATCH');
      }
      return read(async (client) => {
        const ranked = new Map<
          string,
          { row: Record<string, unknown>; modes: SourceEvidence['retrievalModes']; score: number }
        >();
        const merge = (
          rows: Record<string, unknown>[],
          mode: SourceEvidence['retrievalModes'][number],
        ) =>
          rows.forEach((row, index) => {
            const key = String(row.snapshot_key),
              current = ranked.get(key);
            const score = (mode === 'exact' ? 1 : 0) + 1 / (60 + index + 1);
            if (current) {
              current.score += score;
              current.modes.push(mode);
            } else ranked.set(key, { row, modes: [mode], score });
          });
        const exact = [
          ...new Set([...references, ...(query.match(/\b\d{1,3}:\d{1,3}\b/gu) ?? [])]),
        ];
        if (exact.length)
          merge(
            (
              await client.query(
                `${selectRows} where exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=p.id and membership.corpus_version=$1) and p.snapshot_key is not null and p.source_role is not null and p.stable_reference=any($2::text[]) order by p.snapshot_key limit $3`,
                [options.corpusVersion, exact, limit],
              )
            ).rows,
            'exact',
          );
        merge(
          (
            await client.query(
              `${selectRows} where exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=p.id and membership.corpus_version=$1) and p.snapshot_key is not null and p.source_role is not null
          and (public.word_similarity($2,p.search_key)>0.08 or p.search_key like '%' || $2 || '%')
          order by public.word_similarity($2,p.search_key) desc,p.snapshot_key limit $3`,
              [options.corpusVersion, normalized, limit],
            )
          ).rows,
          'lexical',
        );
        if (vector && space)
          merge(
            (
              await client.query(
                `${selectRows} join basirah.passage_embedding e on e.passage_id=p.id
          where exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=p.id and membership.corpus_version=$1) and p.snapshot_key is not null and p.source_role is not null
            and e.model_id=$2 and e.dimensions=$3 and public.vector_dims(e.embedding)=$3
            and e.task_type='search_document' and e.corpus_version=$1
          order by e.embedding OPERATOR(public.<=>) $4::public.vector,p.snapshot_key limit $5`,
                [
                  options.corpusVersion,
                  space.modelId,
                  space.dimensions,
                  JSON.stringify(vector),
                  limit,
                ],
              )
            ).rows,
            'semantic',
          );
        const fused = [...ranked.values()].sort(
          (a, b) =>
            b.score - a.score ||
            String(a.row.snapshot_key).localeCompare(String(b.row.snapshot_key)),
        );
        // Quoted reference anchors must leave room for newly found assertion evidence.
        const anchors = fused
          .filter((result) => result.modes.includes('exact'))
          .slice(0, Math.max(1, Math.floor(limit / 2)));
        const novel = fused.filter((result) => !result.modes.includes('exact'));
        const selected = [...anchors, ...novel].slice(0, limit);
        for (const candidate of fused) {
          if (selected.length >= limit) break;
          if (!selected.includes(candidate)) selected.push(candidate);
        }
        return selected.map((result) => evidence(result.row, result.modes));
      }, signal);
    },
    async restore(keys, signal) {
      if (!keys.length) return [];
      return read(async (client) => {
        const rows = (
          await client.query(
            `${selectRows} where exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=p.id and membership.corpus_version=$1) and p.snapshot_key is not null and p.source_role is not null and (
          p.snapshot_key=any($2::text[])
          or p.id in (select parent_passage_id from basirah.passage where snapshot_key=any($2::text[]))
          or p.parent_passage_id in (select id from basirah.passage where snapshot_key=any($2::text[]))
          or p.id in (select r.to_passage_id from basirah.passage_relation r join basirah.passage origin on origin.id=r.from_passage_id where origin.snapshot_key=any($2::text[]))
          or p.id in (select r.from_passage_id from basirah.passage_relation r join basirah.passage target on target.id=r.to_passage_id where target.snapshot_key=any($2::text[]))
        ) order by p.snapshot_key limit 80`,
            [options.corpusVersion, keys],
          )
        ).rows;
        return rows.map((row) => evidence(row, ['exact']));
      }, signal);
    },
  };
}
