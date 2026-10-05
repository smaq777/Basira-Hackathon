import type { Pool, PoolClient } from 'pg';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';
import type { SourceContentSelection } from '../../../packages/contracts/src/source-content.js';
import { SOURCE_CONTENT_VIEW_VERSION } from '../../../packages/contracts/src/source-content.js';
import { sourceContentPassages, sourceBlocks } from './source-content-view.js';
import { canonical, sha256 } from './foundation.js';
import { eligibleResearchPage } from './research-page-cache.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import { passageHint, preferredCachePassages } from './research-page-passages.js';
import type { LoadedSourcePolicy } from './source-policy.js';

/** Compare endpoints without revealing credentials; pooled/direct aliases may agree. */
export function assertContentViewDatabaseBinding(readerRaw: string, writerRaw: string) {
  try {
    const reader = new URL(readerRaw),
      writer = new URL(writerRaw);
    const host = (u: URL) => u.hostname.replace('-pooler.', '.');
    if (
      !['postgres:', 'postgresql:'].includes(reader.protocol) ||
      !['postgres:', 'postgresql:'].includes(writer.protocol) ||
      host(reader) !== host(writer) ||
      (reader.port || '5432') !== (writer.port || '5432') ||
      reader.pathname !== writer.pathname ||
      reader.pathname === '/' ||
      !reader.username ||
      !writer.username ||
      decodeURIComponent(reader.username) === decodeURIComponent(writer.username)
    )
      throw Error('SOURCE_CONTENT_DATABASE_BINDING_INVALID');
  } catch {
    throw Error('SOURCE_CONTENT_DATABASE_BINDING_INVALID');
  }
}

/** Insert-only public sidecars. No original updates, acquisition or embeddings. */
export function createSourceContentStore(options: {
  readerPool: Pool;
  writerPool?: Pool;
  policy: LoadedSourcePolicy;
}) {
  const policy = structuredClone(options.policy);
  async function tx<T>(write: boolean, fn: (c: PoolClient) => Promise<T>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const pool = write ? options.writerPool : options.readerPool;
    if (!pool) throw Error('SOURCE_CONTENT_WRITER_REQUIRED');
    const c = await pool.connect();
    try {
      await c.query(write ? 'begin' : 'begin read only');
      await c.query(
        'set local role ' + (write ? 'basirah_cache_writer' : 'basirah_research_runtime'),
      );
      await c.query("set local statement_timeout='5000ms'");
      signal?.throwIfAborted();
      const result = await fn(c);
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
  function eligible(source: SourceEvidence) {
    if (
      !source.snapshotKey.startsWith('web-cache:') ||
      sha256(source.originalText) !== source.originalSha256 ||
      !eligibleResearchPage(source, policy)
    )
      throw Error('SOURCE_CONTENT_PARENT_INELIGIBLE');
  }
  return {
    async store(source: SourceEvidence, selection: SourceContentSelection, signal?: AbortSignal) {
      eligible(source);
      const built = sourceContentPassages(source, selection),
        viewId =
          'content-view:' +
          sha256(
            canonical([
              source.snapshotKey,
              policy.sha256,
              SOURCE_CONTENT_VIEW_VERSION,
              selection.selectionSha256,
            ]),
          );
      const retainedRanges: Array<{
        startUtf16: number;
        endUtf16: number;
        startCodepoint: number;
        endCodepoint: number;
      }> = [];
      const retained = new Set(built.selection.removedBlocks.map((b) => b.blockId));
      for (const b of sourceBlocks(source)) {
        if (retained.has(b.blockId)) continue;
        const prior = retainedRanges.at(-1);
        if (prior?.endUtf16 === b.startOffset) {
          prior.endUtf16 = b.endOffset;
          prior.endCodepoint = b.codePointEnd;
        } else
          retainedRanges.push({
            startUtf16: b.startOffset,
            endUtf16: b.endOffset,
            startCodepoint: b.codePointStart,
            endCodepoint: b.codePointEnd,
          });
      }
      return tx(
        true,
        async (c) => {
          await c.query(
            `insert into basirah.research_page_content_view(view_id,parent_snapshot_key,parent_sha256,source_url,policy_sha256,view_version,selection,selection_canonical,retained_ranges) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb) on conflict do nothing`,
            [
              viewId,
              source.snapshotKey,
              source.originalSha256,
              source.sourceUrl,
              policy.sha256,
              SOURCE_CONTENT_VIEW_VERSION,
              JSON.stringify(selection),
              canonical(selection),
              JSON.stringify(retainedRanges),
            ],
          );
          const row = (
            await c.query(
              'select * from basirah.research_page_content_view where parent_snapshot_key=$1 and view_version=$2',
              [source.snapshotKey, SOURCE_CONTENT_VIEW_VERSION],
            )
          ).rows[0];
          if (
            !row ||
            row.view_id !== viewId ||
            canonical(row.selection) !== canonical(selection) ||
            canonical(row.retained_ranges) !== canonical(retainedRanges)
          )
            throw Error('SOURCE_CONTENT_VIEW_COLLISION');
          for (const p of built.passages)
            await c.query(
              `insert into basirah.research_page_content_passage(passage_id,view_id,start_utf16,end_utf16,core_start_utf16,core_end_utf16,start_codepoint,end_codepoint,core_start_codepoint,core_end_codepoint,original_text,passage_sha256,context_truncated,boundary_truncated,coverage,search_text) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16) on conflict do nothing`,
              [
                p.passageId,
                viewId,
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
          const stored = (
            await c.query(
              'select * from basirah.research_page_content_passage where view_id=$1 order by core_start_utf16',
              [viewId],
            )
          ).rows;
          if (
            stored.length !== built.passages.length ||
            stored.some((r, i) => !bound(r, built.passages[i]!, built.coverage))
          )
            throw Error('SOURCE_CONTENT_PASSAGE_COLLISION');
          return {
            viewId,
            passageCount: stored.length,
            contentCoverage: built.contentCoverage,
            coverage: built.coverage,
            providerCalls: 0,
          };
        },
        signal,
      );
    },
    /** Enrich only already-ranked parents; no new-parent discovery or vector relabelling. */
    async enrich(sources: readonly SourceEvidence[], query: string, signal?: AbortSignal) {
      if (!sources.length) return [];
      if (sources.length > 8 || !query.trim() || query.length > 3000)
        throw Error('SOURCE_CONTENT_QUERY_INVALID');
      const rows = await tx(
        false,
        async (c) =>
          (
            await c.query(
              `with ranked as (select p.*,v.parent_snapshot_key,v.parent_sha256,v.selection,row_number() over(partition by v.parent_snapshot_key order by word_similarity($2,p.search_text) desc,p.start_utf16,p.passage_id) rank from basirah.research_page_content_view v join basirah.research_page_content_passage p using(view_id) where v.parent_snapshot_key=any($1::text[]) and v.policy_sha256=$3 and v.view_version=$4) select * from ranked where rank<=3 order by parent_snapshot_key,rank`,
              [
                sources.map((e) => e.snapshotKey),
                normalizeCorpusSearch(query),
                policy.sha256,
                SOURCE_CONTENT_VIEW_VERSION,
              ],
            )
          ).rows,
        signal,
      );
      return sources.map((source) => {
        const matching = rows.filter((r) => r.parent_snapshot_key === source.snapshotKey);
        if (!matching.length) return source;
        eligible(source);
        const built = sourceContentPassages(source, matching[0]!.selection);
        // A no-removal sidecar does not need to replace compatible existing hints.
        if (!built.selection.removedBlocks.length) return source;
        const hints = matching.map((r) => {
          const p = built.passages.find((p) => p.passageId === r.passage_id);
          if (
            !p ||
            r.parent_sha256 !== source.originalSha256 ||
            canonical(r.selection) !== canonical(built.selection) ||
            !bound(r, p, built.coverage)
          )
            throw Error('SOURCE_CONTENT_DELIVERY_BINDING_INVALID');
          return passageHint(p);
        });
        const enriched = {
          ...source,
          provenance: {
            ...source.provenance,
            sourceContentSelection: built.selection,
            sourceContentViewStatus: 'verified_lexical_view',
            cachePassageHits: hints,
            cachePassageQuerySha256: sha256(query),
            passageIndexCoverage: built.coverage,
          },
        };
        preferredCachePassages(enriched, query);
        return enriched;
      });
    },
  };
}
function bound(
  r: Record<string, unknown>,
  p: ReturnType<typeof sourceContentPassages>['passages'][number],
  coverage: ReturnType<typeof sourceContentPassages>['coverage'],
) {
  return (
    r.passage_id === p.passageId &&
    r.start_utf16 === p.startOffset &&
    r.end_utf16 === p.endOffset &&
    r.core_start_utf16 === p.coreStart &&
    r.core_end_utf16 === p.coreEnd &&
    r.start_codepoint === p.codePointStart &&
    r.end_codepoint === p.codePointEnd &&
    r.core_start_codepoint === p.codePointCoreStart &&
    r.core_end_codepoint === p.codePointCoreEnd &&
    r.original_text === p.originalText &&
    r.passage_sha256 === p.passageSha256 &&
    r.context_truncated === p.contextTruncated &&
    r.boundary_truncated === p.boundaryTruncated &&
    canonical(r.coverage) === canonical(coverage)
  );
}
