import {
  CacheRestoreDiagnosticsSchema,
  CacheSearchDiagnosticsSchema,
  type CacheSearchDiagnostics,
} from '../../../packages/contracts/src/semantic-assessment.js';
import {
  retrievalDeadline,
  retrievalCancellation,
  RetrievalDeadlineError,
} from './retrieval-deadline.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';
import type { ResearchPageCache } from './research-page-cache.js';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';

function representation(row: SourceEvidence): string | undefined {
  if (!row.sourceUrl) return undefined;
  try {
    const url = new URL(row.sourceUrl);
    url.hash = '';
    return `${url.href}\n${row.originalSha256}`;
  } catch {
    return undefined;
  }
}

/** Reusable pages participate before assessment, so a weak cache hit cannot suppress web search. */
export function withResearchPageCorpus(
  base: ClaimCorpusSearch,
  cache: ResearchPageCache,
  options: { timeoutMs?: number } = {},
): ClaimCorpusSearch {
  const timeoutMs = options.timeoutMs ?? 3000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw Error('CACHE_SEARCH_BUDGET_INVALID');
  const searchWithDiagnostics: NonNullable<ClaimCorpusSearch['searchWithDiagnostics']> = (
    query,
    references,
    signal,
  ) =>
    retrievalCancellation(async () => {
      const started = Date.now();
      let cacheElapsedMs = 0;
      const cacheWork = retrievalDeadline(
        async (cachedSignal) => {
          if (cache.searchWithDiagnostics) {
            const result = await cache.searchWithDiagnostics(query, cachedSignal);
            return {
              evidence: result.evidence,
              diagnostics: CacheSearchDiagnosticsSchema.parse(result.diagnostics),
            };
          }
          const evidence = await cache.search(query, cachedSignal);
          return {
            evidence,
            diagnostics: {
              outcome: 'success' as const,
              elapsedMs: 0,
              parentCandidateCount: evidence.length,
              failureCodes: [],
            },
          };
        },
        timeoutMs,
        signal,
      ).finally(() => {
        cacheElapsedMs = Math.min(240000, Math.max(0, Date.now() - started));
      });
      const [originals, pages] = await Promise.allSettled([
        base.search(query, references, signal),
        cacheWork,
      ]);
      signal?.throwIfAborted();
      if (originals.status === 'rejected') throw originals.reason;
      const exact = originals.value.filter((row) => row.retrievalModes.includes('exact'));
      const other = originals.value.filter((row) => !row.retrievalModes.includes('exact'));
      // Base rows keep their authority and complete parent families. Cache keys
      // can alias the same page original under a separate storage identity.
      const keys = new Set(originals.value.map((row) => row.snapshotKey));
      const representations = new Set(originals.value.map(representation).filter(Boolean));
      const cached: SourceEvidence[] = [];
      let deduplicatedParentCount = 0;
      if (pages.status === 'fulfilled') {
        for (const row of pages.value.evidence) {
          const page = representation(row);
          if (keys.has(row.snapshotKey) || (page && representations.has(page))) {
            deduplicatedParentCount++;
            continue;
          }
          keys.add(row.snapshotKey);
          if (page) representations.add(page);
          if (cached.length < 2) cached.push(row);
        }
      }
      const cacheDiagnostic: CacheSearchDiagnostics = CacheSearchDiagnosticsSchema.parse({
        ...(pages.status === 'fulfilled'
          ? pages.value.diagnostics
          : {
              outcome: pages.reason instanceof RetrievalDeadlineError ? 'timeout' : 'unavailable',
              parentCandidateCount: 0,
              failureCodes: [
                pages.reason instanceof RetrievalDeadlineError
                  ? 'cache_timeout'
                  : 'cache_unavailable',
              ],
            }),
        elapsedMs: cacheElapsedMs,
        budgetMs: timeoutMs,
        selectedParentCount: cached.length,
        deduplicatedParentCount,
      });
      return {
        evidence: [
          ...new Map([...exact, ...cached, ...other].map((row) => [row.snapshotKey, row])).values(),
        ],
        cache: cacheDiagnostic,
      };
    }, signal);
  const restoreWithDiagnostics: NonNullable<ClaimCorpusSearch['restoreWithDiagnostics']> = (
    keys,
    signal,
  ) =>
    retrievalCancellation(async () => {
      const baseKeys = keys.filter((key) => !key.startsWith('web-cache:'));
      const pageKeys = keys.filter((key) => key.startsWith('web-cache:'));
      const started = Date.now();
      let cacheElapsedMs = 0;
      const cacheWork = (
        pageKeys.length
          ? retrievalDeadline(
              (cachedSignal) => cache.restore(pageKeys, cachedSignal),
              timeoutMs,
              signal,
            )
          : Promise.resolve([] as SourceEvidence[])
      ).finally(() => {
        cacheElapsedMs = Math.min(240000, Math.max(0, Date.now() - started));
      });
      const [originals, pages] = await Promise.allSettled([
        base.restore(baseKeys, signal),
        cacheWork,
      ]);
      signal?.throwIfAborted();
      if (originals.status === 'rejected') throw originals.reason;
      const cached = pages.status === 'fulfilled' ? pages.value : [];
      return {
        evidence: [...originals.value, ...cached],
        ...(pageKeys.length
          ? {
              cacheRestore: CacheRestoreDiagnosticsSchema.parse({
                outcome:
                  pages.status === 'fulfilled'
                    ? 'success'
                    : pages.reason instanceof RetrievalDeadlineError
                      ? 'timeout'
                      : 'unavailable',
                elapsedMs: cacheElapsedMs,
                budgetMs: timeoutMs,
                restoredParentCount: cached.length,
                failureCodes:
                  pages.status === 'fulfilled'
                    ? []
                    : [
                        pages.reason instanceof RetrievalDeadlineError
                          ? 'cache_timeout'
                          : 'cache_unavailable',
                      ],
              }),
            }
          : {}),
      };
    }, signal);
  return {
    searchWithDiagnostics,
    restoreWithDiagnostics,
    async search(query, references, signal) {
      return (await searchWithDiagnostics(query, references, signal)).evidence;
    },
    async restore(keys, signal) {
      return (await restoreWithDiagnostics(keys, signal)).evidence;
    },
  };
}
