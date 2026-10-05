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
): ClaimCorpusSearch {
  return {
    async search(query, references, signal) {
      const cachedSignal = AbortSignal.any([
        AbortSignal.timeout(3000),
        ...(signal ? [signal] : []),
      ]);
      const [originals, pages] = await Promise.allSettled([
        base.search(query, references, signal),
        cache.search(query, cachedSignal),
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
      if (pages.status === 'fulfilled') {
        for (const row of pages.value) {
          const page = representation(row);
          if (keys.has(row.snapshotKey) || (page && representations.has(page))) continue;
          keys.add(row.snapshotKey);
          if (page) representations.add(page);
          cached.push(row);
          if (cached.length === 2) break;
        }
      }
      return [
        ...new Map([...exact, ...cached, ...other].map((row) => [row.snapshotKey, row])).values(),
      ];
    },
    async restore(keys, signal) {
      const baseKeys = keys.filter((key) => !key.startsWith('web-cache:'));
      const pageKeys = keys.filter((key) => key.startsWith('web-cache:'));
      const [originals, pages] = await Promise.allSettled([
        base.restore(baseKeys, signal),
        pageKeys.length ? cache.restore(pageKeys, signal) : Promise.resolve([]),
      ]);
      signal?.throwIfAborted();
      if (originals.status === 'rejected') throw originals.reason;
      return [...originals.value, ...(pages.status === 'fulfilled' ? pages.value : [])];
    },
  };
}
