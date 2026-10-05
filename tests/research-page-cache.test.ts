import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { createResearchPageCache } from '../apps/api/src/research-page-cache.js';
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
const policy = parseSourcePolicy({
  schemaVersion: 1,
  policyVersion: 'v1',
  referenceDocument: { name: 'Owned test', sha256: 'a'.repeat(64), pages: [] },
  deniedDomains: [],
  sources: [
    {
      id: 'owned',
      domain: 'example.com',
      pathPrefixes: ['/public/'],
      excludedPrefixes: ['/public/private/'],
      enabled: true,
      basis: 'owner_selected',
      documentPages: [],
      sourceRole: 'scholar_explanation',
      notes: 'Owned synthetic fixture.',
    },
  ],
});
const evidence = (text = 'Owned public source about family duties'): SourceEvidence => ({
  snapshotKey: 'web:' + sha256(text),
  sourceId: 'web-owned',
  sourceVersion: 'v1',
  sourceRole: 'scholar_explanation',
  reference: 'Owned source',
  originalText: text,
  originalSha256: sha256(text),
  work: 'Owned work',
  author: null,
  edition: null,
  sourceUrl: 'https://example.com/public/family',
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'live',
  retrievalModes: ['lexical'],
  provenance: {
    sourcePolicySha256: policy.sha256,
    sourcePolicyVersion: 'v1',
    provider: 'firecrawl',
    acquiredAt: '2026-10-05T00:00:00Z',
    gapReason: 'private',
    querySha256: 'secret-query-hash',
    reviewId: 'private-review',
  },
});
function fixture() {
  const rows = new Map<
    string,
    { evidence: SourceEvidence; expired?: boolean; revoked?: boolean }
  >();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith('insert into')) {
      const e = JSON.parse(values[4] as string);
      if (rows.has(e.snapshotKey)) return { rows: [] };
      rows.set(e.snapshotKey, { evidence: e });
      return { rows: [{ snapshot_key: e.snapshotKey }] };
    }
    if (sql.startsWith('update basirah.research_page_cache')) {
      const row = rows.get(values[0] as string);
      if (row && !row.revoked) row.expired = false;
      return { rows: [] };
    }
    if (sql.startsWith('select evidence')) {
      const selected = sql.includes('snapshot_key=$1')
        ? [rows.get(values[0] as string)].filter(Boolean)
        : sql.includes('snapshot_key=any')
          ? (values[0] as string[]).map((k) => rows.get(k)).filter(Boolean)
          : [...rows.values()];
      return {
        rows: selected
          .filter(
            (row) =>
              row &&
              (!sql.includes('revoked_at is null') || !row.revoked) &&
              (!sql.includes('expires_at>') || !row.expired),
          )
          .map((row) => ({ ...row, lexical_hit: true, semantic_hit: false })),
      };
    }
    return { rows: [] };
  });
  const readerPool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  const classify = vi.fn(async () => ({
    topics: ['family' as const],
    modelId: 'small-model',
    promptVersion: 'topic-v1',
    requestSha256: 'b'.repeat(64),
    responseSha256: 'c'.repeat(64),
  }));
  const cache = createResearchPageCache({ readerPool, writerPool: readerPool, policy, classify });
  return { cache, rows, query, classify, readerPool };
}
describe('public research page cache', () => {
  it('preserves all eight legacy ranks and top-two unindexed title hits while enriching indexed parents', async () => {
    const f = fixture();
    const legacy = Array.from({ length: 8 }, (_, i) =>
      evidence(i === 0 ? 'تعريف الربا وبيان أنواعه' : `Owned legacy parent ${i}`),
    );
    for (const row of legacy) f.rows.set(row.snapshotKey, { evidence: row });
    const indexed = {
      ...legacy[4]!,
      retrievalModes: ['semantic' as const],
      provenance: {
        ...legacy[4]!.provenance,
        cachePassageHits: [{ passageId: 'verified-middle-window' }],
        cachePassageQuerySha256: sha256('query'),
        passageIndexCoverage: 'selected',
      },
    };
    const extra = evidence('Owned passage-only parent');
    const cache = createResearchPageCache({
      readerPool: f.readerPool,
      writerPool: f.readerPool,
      policy,
      classify: f.classify,
      passageIndex: { search: async () => [extra, indexed] },
    });
    const before = structuredClone(legacy);
    const found = await cache.search('تعريف الربا وبيان أنواعه');
    expect(found.map((e) => e.snapshotKey)).toEqual(legacy.map((e) => e.snapshotKey));
    expect(found.slice(0, 2).map((e) => e.snapshotKey)).toEqual(
      legacy.slice(0, 2).map((e) => e.snapshotKey),
    );
    expect(found[4]!.provenance.cachePassageHits).toEqual(indexed.provenance.cachePassageHits);
    expect(found[4]!.retrievalModes).toEqual(['lexical', 'semantic']);
    expect(found[4]!.originalText).toBe(legacy[4]!.originalText);
    expect(legacy).toEqual(before);
  });
  it('appends passage-only parents only into vacancies and refuses mismatched enrichment', async () => {
    const f = fixture(),
      parent = evidence(),
      extra = evidence('Owned extra parent');
    f.rows.set(parent.snapshotKey, { evidence: parent });
    const cache = createResearchPageCache({
      readerPool: f.readerPool,
      writerPool: f.readerPool,
      policy,
      classify: f.classify,
      passageIndex: {
        search: async () => [
          {
            ...parent,
            sourceUrl: 'https://example.com/public/other',
            provenance: { cachePassageHits: ['wrong'] },
          },
          extra,
        ],
      },
    });
    const found = await cache.search('family');
    expect(found.map((e) => e.snapshotKey)).toEqual([parent.snapshotKey, extra.snapshotKey]);
    expect(found[0]!.provenance.cachePassageHits).toBeUndefined();
    expect(found[0]!.sourceUrl).toBe(parent.sourceUrl);
  });
  it.each([
    'cachePassageHits',
    'cachePassageQuerySha256',
    'cachePassageHitsByQuery',
    'passageIndexCoverage',
    'passageIndexStatus',
  ])('rejects transient %s before shared admission without changing provenance', async (key) => {
    const f = fixture(),
      e = evidence();
    e.provenance[key] = 'report-local';
    const before = structuredClone(e);
    await expect(f.cache.store([e])).rejects.toThrow('CACHE_TRANSIENT_PROVENANCE_FORBIDDEN');
    expect(f.query).not.toHaveBeenCalled();
    expect(f.classify).not.toHaveBeenCalled();
    expect(e).toEqual(before);
  });
  it('persists exact originals with machine topics, strips private provenance, and reuses without classifying again', async () => {
    const f = fixture(),
      e = evidence();
    const stored = await f.cache.store([e]);
    await f.cache.store([e]);
    const found = await f.cache.search('family duties');
    expect(f.classify).toHaveBeenCalledTimes(1);
    expect(found[0]!.originalText).toBe(e.originalText);
    expect(found[0]!.snapshotKey).toBe(stored.storedKeys[0]);
    expect(found[0]!.provenance.topics).toEqual(['family']);
    expect(found[0]!.provenance.querySha256).toBeUndefined();
    expect(found[0]!.provenance.reviewId).toBeUndefined();
    expect(found[0]!.provenance.gapReason).toBeUndefined();
    expect(found[0]!.approvalStatus).toBe('pending');
    expect(found[0]!.researchOnly).toBe(true);
  });
  it('versions changed public originals without overwriting and rejects hash or policy mismatches', async () => {
    const f = fixture();
    await f.cache.store([evidence()]);
    await f.cache.store([evidence('Changed owned public original')]);
    expect(f.rows.size).toBe(2);
    await expect(
      f.cache.store([{ ...evidence(), originalSha256: 'f'.repeat(64) }]),
    ).rejects.toThrow('CACHE_SOURCE_INELIGIBLE');
    await expect(
      f.cache.store([{ ...evidence(), provenance: { sourcePolicySha256: 'f'.repeat(64) } }]),
    ).rejects.toThrow('CACHE_SOURCE_INELIGIBLE');
    await expect(
      f.cache.store([{ ...evidence(), sourceUrl: 'https://example.com/public/private/secret' }]),
    ).rejects.toThrow('CACHE_SOURCE_INELIGIBLE');
  });
  it('checks expiry/revocation/current policy in SQL, aborts, and refuses untyped labels or incompatible vectors', async () => {
    const f = fixture();
    await f.cache.search('family');
    expect(
      f.query.mock.calls.some(
        ([sql]) =>
          sql.includes('policy_sha256=$1') &&
          sql.includes('expires_at>clock_timestamp()') &&
          sql.includes('revoked_at is null'),
      ),
    ).toBe(true);
    const abort = new AbortController();
    abort.abort();
    await expect(f.cache.store([evidence()], abort.signal)).rejects.toThrow();
    const pool = { connect: async () => ({ query: f.query, release: vi.fn() }) } as unknown as Pool;
    const bad = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: async () => ({ ...(await f.classify()), topics: ['approval' as never] }),
    });
    await expect(bad.store([evidence()])).rejects.toThrow();
    const vector = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
      embeddingSpace: { modelId: 'embed', embed: async () => [1] },
    });
    await expect(vector.store([evidence()])).rejects.toThrow('CACHE_EMBEDDING_INVALID');
  });
  it('restores exact originals, hides expired or revoked rows, refreshes only fresh matching acquisition, and rejects corrupted originals', async () => {
    const f = fixture(),
      key = (await f.cache.store([evidence()])).storedKeys[0]!;
    f.rows.get(key)!.expired = true;
    expect(await f.cache.restore([key])).toEqual([]);
    await f.cache.store([evidence()]);
    expect((await f.cache.restore([key]))[0]!.originalText).toBe(evidence().originalText);
    expect(f.classify).toHaveBeenCalledTimes(1);
    f.rows.get(key)!.revoked = true;
    expect(await f.cache.restore([key])).toEqual([]);
    await expect(f.cache.store([evidence()])).rejects.toThrow('CACHE_IDENTITY_COLLISION');
    expect(f.rows.get(key)!.revoked).toBe(true);
    f.rows.get(key)!.revoked = false;
    f.rows.get(key)!.evidence.originalText = 'Corrupted original';
    await expect(f.cache.search('family')).rejects.toThrow('CACHE_ORIGINAL_HASH_MISMATCH');
    await expect(f.cache.restore([key])).rejects.toThrow('CACHE_ORIGINAL_HASH_MISMATCH');
  });
  it('retains lexical originals and topics during embedding outages, and embeds only a declared <=3000-character view', async () => {
    const f = fixture(),
      pool = { connect: async () => ({ query: f.query, release: vi.fn() }) } as unknown as Pool;
    const outage = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
      embeddingSpace: {
        modelId: 'embed',
        embed: async () => {
          throw Error('Provider unavailable');
        },
      },
    });
    await outage.store([evidence()]);
    expect((await outage.search('family'))[0]!.provenance.embeddingStatus).toBe('unavailable');
    const embed = vi.fn(async (_text: string) => Array(1536).fill(0.1));
    const dense = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
      embeddingSpace: { modelId: 'embed', embed },
    });
    const text = 'Owned public original. '.repeat(500);
    const key = (await dense.store([evidence(text)])).storedKeys[0]!;
    expect(embed.mock.calls[0]![0]!.length).toBeLessThanOrEqual(3000);
    expect(f.rows.get(key)!.evidence.originalText).toBe(text);
    expect(f.rows.get(key)!.evidence.provenance.embeddingView).toMatchObject({
      method: 'title_topics_head_tail_v1',
      fullTextSemanticCoverage: false,
      dimensions: 1536,
    });
  });
  it('rolls back when cancellation arrives after insertion and never commits that transaction', async () => {
    const f = fixture(),
      abort = new AbortController();
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      const result = await f.query(sql, values);
      if (sql.startsWith('insert into')) abort.abort();
      return result;
    });
    const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const cache = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
    });
    await expect(cache.store([evidence()], abort.signal)).rejects.toThrow();
    const afterInsert = query.mock.calls
      .slice(query.mock.calls.findIndex(([sql]) => sql.startsWith('insert into')) + 1)
      .map(([sql]) => sql);
    expect(afterInsert).toContain('rollback');
    expect(afterInsert).not.toContain('commit');
    expect(query.mock.calls.some(([sql]) => sql.includes("statement_timeout='5000ms'"))).toBe(true);
  });
  it('uses lexical SQL after a slow uncooperative query embedding times out and handles late rejection', async () => {
    const f = fixture();
    await f.cache.store([evidence()]);
    f.query.mockClear();
    const pool = { connect: async () => ({ query: f.query, release: vi.fn() }) } as unknown as Pool;
    let rejectLate: (error: Error) => void = () => undefined;
    const cache = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
      embeddingSpace: {
        modelId: 'embed',
        embed: () =>
          new Promise<number[]>((_resolve, reject) => {
            rejectLate = reject;
          }),
      },
    });
    vi.useFakeTimers();
    try {
      const search = cache.search('family');
      await vi.advanceTimersByTimeAsync(1500);
      const result = await search;
      expect(result[0]!.originalText).toBe(evidence().originalText);
      const lexicalQuery = f.query.mock.calls.find(([sql]) => sql.startsWith('select evidence'));
      expect(lexicalQuery![1]![2]).toBeNull();
      rejectLate(new Error('Late provider failure'));
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });
  it('external search cancellation rejects promptly before any database query even with uncooperative embedding', async () => {
    const f = fixture(),
      abort = new AbortController();
    const pool = { connect: async () => ({ query: f.query, release: vi.fn() }) } as unknown as Pool;
    const cache = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: f.classify,
      embeddingSpace: { modelId: 'embed', embed: () => new Promise<number[]>(() => undefined) },
    });
    const search = cache.search('family', abort.signal);
    const rejected = expect(search).rejects.toThrow();
    abort.abort();
    await rejected;
    expect(f.query).not.toHaveBeenCalled();
  });
});
