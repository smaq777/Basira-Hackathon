import { afterEach, describe, expect, it, vi } from 'vitest';
import { withResearchPageCorpus } from '../apps/api/src/cached-corpus.js';
import type { ClaimCorpusSearch } from '../apps/api/src/claim-retrieval.js';
import type { ResearchPageCache } from '../apps/api/src/research-page-cache.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';

const row = (snapshotKey: string, retrievalModes: SourceEvidence['retrievalModes'] = ['lexical']) =>
  ({ snapshotKey, retrievalModes }) as SourceEvidence;
function setup() {
  const base: ClaimCorpusSearch = {
    search: vi.fn().mockResolvedValue([row('related'), row('verse', ['exact'])]),
    restore: vi.fn().mockResolvedValue([row('verse'), row('tafsir-context')]),
  };
  const cache: ResearchPageCache = {
    search: vi.fn().mockResolvedValue([row('web-cache:1'), row('web-cache:2'), row('web-cache:3')]),
    restore: vi.fn().mockResolvedValue([row('web-cache:1')]),
    store: vi.fn(),
  };
  return { base, cache, combined: withResearchPageCorpus(base, cache) };
}
describe('reusable research corpus before assessment', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps exact canonical references first while admitting bounded cached candidates', async () => {
    const { combined } = setup();
    expect((await combined.search('author assertion', ['2:1'])).map((r) => r.snapshotKey)).toEqual([
      'verse',
      'web-cache:1',
      'web-cache:2',
      'related',
    ]);
  });
  it('filters cache aliases of all base rows while preserving exact authority and families', async () => {
    const { base, cache, combined } = setup();
    const exact = {
      ...row('verse', ['exact']),
      sourceUrl: 'https://example.test/source/1',
      originalSha256: 'exact-hash',
      provenance: { authority: 'base' },
    };
    const parent = {
      ...row('parent'),
      sourceUrl: 'https://example.test/source/2',
      originalSha256: 'parent-hash',
    };
    const child = { ...row('child'), parentSnapshotKey: 'parent' };
    vi.mocked(base.search).mockResolvedValue([parent, child, exact]);
    vi.mocked(cache.search).mockResolvedValue([
      { ...exact, snapshotKey: 'web-cache:exact', sourceUrl: exact.sourceUrl + '#section' },
      { ...parent, snapshotKey: 'web-cache:parent' },
      { ...exact, provenance: { authority: 'cache' } },
      row('web-cache:new-1'),
      row('web-cache:new-2'),
    ]);
    expect(await combined.search('assertion', [])).toEqual([
      exact,
      row('web-cache:new-1'),
      row('web-cache:new-2'),
      parent,
      child,
    ]);
  });
  it('deduplicates cached page originals before filling two slots and retains changed hashes', async () => {
    const { cache, combined } = setup();
    const first = {
      ...row('web-cache:first'),
      sourceUrl: 'https://example.test/page',
      originalSha256: 'original-hash',
    };
    const changed = {
      ...first,
      snapshotKey: 'web-cache:changed',
      originalSha256: 'changed-hash',
    };
    vi.mocked(cache.search).mockResolvedValue([
      first,
      { ...first, snapshotKey: 'web-cache:alias' },
      changed,
      row('web-cache:overflow'),
    ]);
    expect((await combined.search('assertion', [])).map((r) => r.snapshotKey)).toEqual([
      'verse',
      'web-cache:first',
      'web-cache:changed',
      'related',
    ]);
  });
  it('restores source context through its owning corpus rather than mixing database keys', async () => {
    const { base, cache, combined } = setup();
    const rows = await combined.restore(['verse', 'web-cache:1']);
    expect(base.restore).toHaveBeenCalledWith(['verse'], undefined);
    expect(cache.restore).toHaveBeenCalledWith(['web-cache:1'], expect.any(AbortSignal));
    expect(rows.map((r) => r.snapshotKey)).toEqual(['verse', 'tafsir-context', 'web-cache:1']);
  });
  it('preserves base retrieval when the optional cache is unavailable', async () => {
    const { cache, combined } = setup();
    vi.mocked(cache.search).mockRejectedValue(new Error('cache unavailable'));
    expect((await combined.search('assertion', [])).map((r) => r.snapshotKey)).toEqual([
      'verse',
      'related',
    ]);
  });
  it('does not conceal a canonical corpus failure behind cached pages', async () => {
    const { base, combined } = setup();
    vi.mocked(base.search).mockRejectedValue(new Error('base unavailable'));
    await expect(combined.search('assertion', [])).rejects.toThrow('base unavailable');
  });
  it('does not convert cancellation into an empty successful search', async () => {
    const { combined } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(combined.search('assertion', [], controller.signal)).rejects.toThrow();
  });
  it('delivers slow cached success within an explicitly longer bounded search budget', async () => {
    vi.useFakeTimers();
    const { base, cache } = setup();
    vi.mocked(cache.search).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([row('web-cache:slow')]), 3500)),
    );
    const combined = withResearchPageCorpus(base, cache, { timeoutMs: 5000 });
    const pending = combined.searchWithDiagnostics!('assertion', []);
    await vi.advanceTimersByTimeAsync(3501);
    const result = await pending;
    expect(result.evidence.map((r) => r.snapshotKey)).toContain('web-cache:slow');
    expect(result.cache).toMatchObject({
      outcome: 'success',
      parentCandidateCount: 1,
      selectedParentCount: 1,
      budgetMs: 5000,
    });
  });
  it('hard-races hung cache work and ignores its later success without changing base authority', async () => {
    vi.useFakeTimers();
    const { base, cache } = setup();
    let finish!: (rows: SourceEvidence[]) => void;
    let receivedSignal: AbortSignal | undefined;
    vi.mocked(cache.search).mockImplementation((_query, signal) => {
      receivedSignal = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const combined = withResearchPageCorpus(base, cache, { timeoutMs: 25 });
    const pending = combined.searchWithDiagnostics!('assertion', []);
    await vi.advanceTimersByTimeAsync(26);
    const result = await pending;
    expect(result.evidence.map((r) => r.snapshotKey)).toEqual(['verse', 'related']);
    expect(result.cache).toMatchObject({
      outcome: 'timeout',
      failureCodes: ['cache_timeout'],
      selectedParentCount: 0,
    });
    expect(receivedSignal?.aborted).toBe(true);
    finish([row('web-cache:late')]);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.evidence.map((r) => r.snapshotKey)).toEqual(['verse', 'related']);
  });
  it('propagates caller abort even if both base and cache ignore cancellation', async () => {
    const { base, cache } = setup();
    vi.mocked(base.search).mockImplementation(() => new Promise(() => {}));
    vi.mocked(cache.search).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const combined = withResearchPageCorpus(base, cache, { timeoutMs: 100 });
    const pending = combined.searchWithDiagnostics!('assertion', [], controller.signal);
    const rejected = expect(pending).rejects.toThrow('caller cancelled');
    controller.abort(new Error('caller cancelled'));
    await rejected;
  });
  it('preserves partial zero-row diagnostics per query without global crossover', async () => {
    const { base, cache } = setup();
    cache.searchWithDiagnostics = async (query) =>
      query === 'partial'
        ? {
            evidence: [],
            diagnostics: {
              outcome: 'partial',
              elapsedMs: 1,
              parentCandidateCount: 0,
              failureCodes: ['content_unavailable'],
            },
          }
        : {
            evidence: [row('web-cache:complete')],
            diagnostics: {
              outcome: 'success',
              elapsedMs: 1,
              parentCandidateCount: 1,
              failureCodes: [],
            },
          };
    const combined = withResearchPageCorpus(base, cache);
    const [partial, complete] = await Promise.all([
      combined.searchWithDiagnostics!('partial', []),
      combined.searchWithDiagnostics!('complete', []),
    ]);
    expect(partial.cache).toMatchObject({
      outcome: 'partial',
      parentCandidateCount: 0,
      failureCodes: ['content_unavailable'],
    });
    expect(complete.cache).toMatchObject({
      outcome: 'success',
      parentCandidateCount: 1,
      failureCodes: [],
    });
    expect(complete.evidence.map((r) => r.snapshotKey)).toContain('web-cache:complete');
  });
  it('bounds hung optional restore, preserves base families and ignores late rows', async () => {
    vi.useFakeTimers();
    const { base, cache } = setup();
    let finish!: (rows: SourceEvidence[]) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(cache.restore).mockImplementation((_keys, received) => {
      signal = received;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const combined = withResearchPageCorpus(base, cache, { timeoutMs: 25 });
    const pending = combined.restoreWithDiagnostics!(['verse', 'web-cache:1']);
    await vi.advanceTimersByTimeAsync(26);
    const result = await pending;
    expect(result.evidence.map((row) => row.snapshotKey)).toEqual(['verse', 'tafsir-context']);
    expect(result.cacheRestore).toMatchObject({
      outcome: 'timeout',
      restoredParentCount: 0,
      failureCodes: ['cache_timeout'],
    });
    expect(signal?.aborted).toBe(true);
    finish([row('web-cache:late')]);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.evidence.map((row) => row.snapshotKey)).toEqual(['verse', 'tafsir-context']);
  });
});
