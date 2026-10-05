import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createResearchPagePassageIndex } from '../apps/api/src/research-page-passage-index.js';
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { cachePassages } from '../apps/api/src/research-page-passages.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
const policy = parseSourcePolicy({
  schemaVersion: 1,
  policyVersion: 'v1',
  referenceDocument: { name: 'Owned', sha256: 'a'.repeat(64), pages: [] },
  deniedDomains: [],
  sources: [
    {
      id: 'owned',
      domain: 'example.com',
      pathPrefixes: ['/public/'],
      excludedPrefixes: [],
      enabled: true,
      basis: 'owner_selected',
      documentPages: [],
      sourceRole: 'scholar_explanation',
      notes: 'Owned control.',
    },
  ],
});
function fixture() {
  const text = 'حفظ الحقوق واجب إلا إذا تعذر ذلك.\n'.repeat(170);
  const e: SourceEvidence = {
    snapshotKey: 'web-cache:' + sha256(text),
    sourceId: 'web-owned',
    sourceVersion: 'v1',
    sourceRole: 'scholar_explanation',
    reference: 'Owned',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned',
    author: null,
    edition: null,
    sourceUrl: 'https://example.com/public/owned',
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: { sourcePolicySha256: policy.sha256, sourcePolicyVersion: 'v1' },
  };
  const passages = new Map<string, Record<string, unknown>>(),
    vectors = new Map<string, unknown>();
  let available = true;
  const query = vi.fn(async (sql: string, v: unknown[] = []) => {
    if (sql.startsWith('select evidence from')) return { rows: available ? [{ evidence: e }] : [] };
    if (sql.startsWith('insert into basirah.research_page_passage(')) {
      const keys = [
        'passage_id',
        'parent_snapshot_key',
        'parent_sha256',
        'policy_sha256',
        'chunker_version',
        'start_utf16',
        'end_utf16',
        'core_start_utf16',
        'core_end_utf16',
        'start_codepoint',
        'end_codepoint',
        'core_start_codepoint',
        'core_end_codepoint',
        'original_text',
        'passage_sha256',
        'context_truncated',
        'boundary_truncated',
        'coverage',
        'search_text',
      ];
      if (!passages.has(String(v[0])))
        passages.set(
          String(v[0]),
          Object.fromEntries(
            keys.map((k, i) => [k, k === 'coverage' ? JSON.parse(String(v[i])) : v[i]]),
          ),
        );
      return { rows: [] };
    }
    if (sql.startsWith('select * from basirah.research_page_passage where'))
      return {
        rows: [...passages.values()].sort(
          (a, b) => Number(a.core_start_utf16) - Number(b.core_start_utf16),
        ),
      };
    if (sql.startsWith('select v.passage_id'))
      return { rows: [...vectors.keys()].map((passage_id) => ({ passage_id })) };
    if (sql.startsWith('insert into basirah.research_page_passage_embedding')) {
      if (vectors.has(String(v[0]))) return { rows: [] };
      vectors.set(String(v[0]), v);
      return { rows: [{ passage_id: v[0] }] };
    }
    if (sql.startsWith('with scores'))
      return {
        rows: available
          ? [...passages.values()]
              .slice(0, 3)
              .map((r) => ({ ...r, evidence: e, lexical_hit: true, semantic_hit: !!v[2] }))
          : [],
      };
    return { rows: [] };
  });
  const release = vi.fn(),
    pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  return {
    e,
    query,
    release,
    pool,
    passages,
    vectors,
    hide: () => {
      available = false;
    },
    index: (embed?: (t: string, s?: AbortSignal) => Promise<number[]>) =>
      createResearchPagePassageIndex({ readerPool: pool, writerPool: pool, policy, embed }),
  };
}
const vector = () => [1, ...Array(1535).fill(0)] as number[];
it('prepares a read-only parent-bound plan without acquisition, writes or embeddings', async () => {
  const f = fixture(),
    embed = vi.fn(async () => vector());
  const plan = await f.index(embed).plan([f.e.snapshotKey]);
  expect(plan[0]!.coverage.fullTextIndexed).toBe(true);
  expect(plan[0]!.sourceUrl).toBe(f.e.sourceUrl);
  expect(embed).not.toHaveBeenCalled();
  expect(f.query.mock.calls.some(([sql]) => sql.startsWith('insert'))).toBe(false);
  expect(
    f.query.mock.calls.some(([sql]) => sql === 'set local role basirah_research_runtime'),
  ).toBe(true);
});
it('backfills metadata and compatible vectors idempotently without re-fetching or reclassifying originals', async () => {
  const f = fixture(),
    embed = vi.fn(async () => vector()),
    index = f.index(embed);
  const first = await index.backfill([f.e.snapshotKey], { maxEmbeddings: 32, timeoutMs: 5000 });
  expect(first.attemptedEmbeddings).toBe(cachePassages(f.e).passages.length);
  const repeat = await index.backfill([f.e.snapshotKey], { maxEmbeddings: 32, timeoutMs: 5000 });
  expect(repeat.attemptedEmbeddings).toBe(0);
  expect(repeat.insertedEmbeddings).toBe(0);
  expect(embed).toHaveBeenCalledTimes(first.attemptedEmbeddings);
  expect(f.query.mock.calls.some(([sql]) => sql === 'set local role basirah_cache_writer')).toBe(
    true,
  );
});
it('keeps passage metadata during embedding failure and resumes only in a later explicitly requested job', async () => {
  const f = fixture(),
    failed = vi.fn(async () => {
      throw Error('outage');
    });
  const first = await f
    .index(failed)
    .backfill([f.e.snapshotKey], { maxEmbeddings: 1, timeoutMs: 5000 });
  expect(first.attemptedEmbeddings).toBe(1);
  expect(first.insertedEmbeddings).toBe(0);
  expect(first.results[0]!.failureCodes).toContain('embedding_unavailable');
  expect(f.passages.size).toBeGreaterThan(1);
  const second = await f
    .index(async () => vector())
    .backfill([f.e.snapshotKey], { maxEmbeddings: 1, timeoutMs: 5000 });
  expect(second.insertedEmbeddings).toBe(1);
  expect(second.results[0]!.failureCodes).toContain('embedding_budget_skipped');
});
it('returns full immutable parents with validated passage hints and rejects corrupted persisted offsets', async () => {
  const f = fixture(),
    index = f.index();
  await index.backfill([f.e.snapshotKey], { maxEmbeddings: 0, timeoutMs: 5000 });
  const rows = await index.search('الحقوق', null);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.originalText).toBe(f.e.originalText);
  expect(rows[0]!.provenance.cachePassageHits).toHaveLength(3);
  f.passages.values().next().value!.start_utf16 = 1;
  await expect(index.search('الحقوق', null)).rejects.toThrow('CACHE_PASSAGE_BINDING_INVALID');
});
it('enforces parent availability, policy and immutable identity before writing or returning a source', async () => {
  const f = fixture();
  f.hide();
  await expect(
    f.index().backfill([f.e.snapshotKey], { maxEmbeddings: 0, timeoutMs: 5000 }),
  ).rejects.toThrow('CACHE_PASSAGE_PARENT_UNAVAILABLE');
  expect(f.passages.size).toBe(0);
  const g = fixture();
  g.e.provenance.sourcePolicySha256 = '0'.repeat(64);
  await expect(g.index().plan([g.e.snapshotKey])).rejects.toThrow(
    'CACHE_PASSAGE_PARENT_INELIGIBLE',
  );
});
it('rejects unbounded batches and incompatible or fake vectors; a pre-cancelled job never writes', async () => {
  const f = fixture(),
    index = f.index();
  await expect(
    index.backfill([f.e.snapshotKey], { maxEmbeddings: 257, timeoutMs: 5000 }),
  ).rejects.toThrow('CACHE_PASSAGE_BATCH_INVALID');
  await expect(index.search('query', [0, 1])).rejects.toThrow('CACHE_PASSAGE_VECTOR_INVALID');
  await expect(index.search('query', Array(1536).fill(0))).rejects.toThrow(
    'CACHE_PASSAGE_VECTOR_INVALID',
  );
  const c = new AbortController();
  c.abort();
  await expect(
    index.backfill([f.e.snapshotKey], { maxEmbeddings: 0, timeoutMs: 5000 }, c.signal),
  ).rejects.toThrow();
  expect(f.passages.size).toBe(0);
});
it('does not commit a vector after cancellation during an uncooperative embedding', async () => {
  const f = fixture(),
    c = new AbortController();
  const embed = vi.fn(async () => {
    c.abort();
    return vector();
  });
  await expect(
    f.index(embed).backfill([f.e.snapshotKey], { maxEmbeddings: 1, timeoutMs: 5000 }, c.signal),
  ).rejects.toThrow();
  expect(f.passages.size).toBeGreaterThan(0);
  expect(f.vectors.size).toBe(0);
});
