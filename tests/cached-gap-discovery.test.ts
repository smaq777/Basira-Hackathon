import { it, expect, vi } from 'vitest';
import { withResearchPageCache } from '../apps/api/src/cached-gap-discovery.js';
import type { ResearchPageCache } from '../apps/api/src/research-page-cache.js';
import type { ClaimGapDiscovery } from '../apps/api/src/claim-retrieval.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
import { sha256 } from '../apps/api/src/foundation.js';
const text = 'Owned original page with an explicit condition.';
const page: SourceEvidence = {
  snapshotKey: 'web:owned',
  sourceId: 'web-owned',
  sourceVersion: 'owned-1',
  sourceRole: 'book_excerpt',
  reference: 'Owned page',
  originalText: text,
  originalSha256: sha256(text),
  work: 'Owned work',
  author: null,
  edition: null,
  sourceUrl: 'https://owned.example/book/1',
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'live',
  retrievalModes: ['lexical'],
  provenance: { representation: 'extracted_markdown' },
};
const claim = {
  id: `claim-${'a'.repeat(24)}`,
  segmentId: 'author',
  originalText: 'حفظ الأمانة',
  startOffset: 0,
  endOffset: 10,
  evidenceKeys: [],
  provisional: true as const,
};
const gap = { reason: 'not_established' as const, query: claim.originalText };
const fixture = () => ({
  live: {
    discover: vi
      .fn<ClaimGapDiscovery['discover']>()
      .mockResolvedValue({ evidence: [page], failureCodes: [] }),
  },
  cache: {
    store: vi
      .fn<ResearchPageCache['store']>()
      .mockResolvedValue({ storedKeys: ['web-cache:owned'], failureCodes: [] }),
    search: vi.fn<ResearchPageCache['search']>(),
    restore: vi.fn(async () => []),
  } as ResearchPageCache,
});
it('persists originals but does not substitute a cache search for a semantic gap', async () => {
  const { live, cache } = fixture();
  const result = await withResearchPageCache(live, cache, { timeoutMs: 65000 }).discover(
    claim,
    gap,
  );
  expect(result.evidence).toEqual([page]);
  expect(cache.search).not.toHaveBeenCalled();
  expect(live.discover).toHaveBeenCalledOnce();
  expect(cache.store).toHaveBeenCalledWith([page], expect.any(AbortSignal));
});
it('preserves acquired originals and exposes partial persistence failures', async () => {
  const { live, cache } = fixture();
  vi.mocked(cache.store).mockRejectedValue(new Error('cache database outage'));
  const result = await withResearchPageCache(live, cache, { timeoutMs: 65000 }).discover(
    claim,
    gap,
  );
  expect(result).toEqual({ evidence: [page], failureCodes: ['discovery_cache_write_failed'] });
  vi.mocked(cache.store).mockResolvedValue({
    storedKeys: [],
    failureCodes: ['cache_embedding_failed'],
  });
  expect(
    (await withResearchPageCache(live, cache, { timeoutMs: 65000 }).discover(claim, gap))
      .failureCodes,
  ).toEqual(['cache_embedding_failed']);
});
it('awaits cooperative cache timeout cleanup and retains current-report evidence', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  const { live, cache } = fixture();
  let cleaned = false;
  vi.mocked(cache.store).mockImplementation(
    (_pages, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            setTimeout(() => {
              cleaned = true;
              reject(new Error('cancelled cache write'));
            }, 4000);
          },
          { once: true },
        );
      }),
  );
  try {
    const pending = withResearchPageCache(live, cache, { timeoutMs: 65000 }).discover(claim, gap);
    await vi.advanceTimersByTimeAsync(25000);
    expect(cleaned).toBe(false);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;
    expect(cleaned).toBe(true);
    expect(result.evidence).toEqual([page]);
    expect(result.failureCodes).toEqual(['discovery_cache_write_failed']);
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
it('skips optional persistence under the original small budget and respects caller cancellation', async () => {
  const { live, cache } = fixture();
  const result = await withResearchPageCache(live, cache).discover(claim, gap);
  expect(result.evidence).toEqual([page]);
  expect(result.failureCodes).toEqual(['discovery_cache_write_budget_skipped']);
  expect(cache.store).not.toHaveBeenCalled();
  await expect(
    withResearchPageCache(live, cache, { timeoutMs: 65000 }).discover(
      claim,
      gap,
      AbortSignal.abort(),
    ),
  ).rejects.toThrow();
  expect(live.discover).toHaveBeenCalledTimes(1);
});
