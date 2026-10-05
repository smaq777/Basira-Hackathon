import type { ClaimGapDiscovery } from './claim-retrieval.js';
import type { ResearchPageCache } from './research-page-cache.js';

/** Public cache reuse happens before assessment; this wrapper only persists fresh discovery. */
export function withResearchPageCache(
  live: ClaimGapDiscovery,
  cache: ResearchPageCache,
  options: { timeoutMs?: number } = {},
): ClaimGapDiscovery {
  const totalMs = options.timeoutMs ?? 8000;
  if (!Number.isInteger(totalMs) || totalMs < 1 || totalMs > 65000)
    throw new Error('DISCOVERY_CACHE_BUDGET_INVALID');
  return {
    async discover(claim, gap, external) {
      external?.throwIfAborted();
      const started = Date.now(),
        failures: string[] = [];
      const remaining = () => totalMs - (Date.now() - started);
      const liveSignal = AbortSignal.any([
        AbortSignal.timeout(Math.max(1, Math.min(30000, totalMs - 1000))),
        ...(external ? [external] : []),
      ]);
      const result = await live.discover(claim, gap, liveSignal);
      external?.throwIfAborted();
      if (result.evidence.length > 2) throw new Error('discovery_source_bound_exceeded');
      if (result.evidence.length) {
        // Await cancellation and SQL rollback. A 10-second cleanup reserve covers
        // the cache's bounded active statement and rollback; no write is detached.
        const writeBudget = Math.min(25000, remaining() - 10000);
        if (writeBudget < 1000) failures.push('discovery_cache_write_budget_skipped');
        else {
          const writeSignal = AbortSignal.any([
            AbortSignal.timeout(writeBudget),
            ...(external ? [external] : []),
          ]);
          try {
            const stored = await cache.store(result.evidence, writeSignal);
            failures.push(...stored.failureCodes);
          } catch {
            external?.throwIfAborted();
            failures.push('discovery_cache_write_failed');
          }
        }
      }
      external?.throwIfAborted();
      return {
        evidence: result.evidence,
        failureCodes: [...result.failureCodes, ...failures].slice(0, 9),
      };
    },
  };
}
