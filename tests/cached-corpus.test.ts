import { describe, expect, it, vi } from 'vitest';
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
    expect(cache.restore).toHaveBeenCalledWith(['web-cache:1'], undefined);
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
});
