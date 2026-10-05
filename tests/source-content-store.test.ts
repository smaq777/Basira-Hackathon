import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  createSourceContentStore,
  assertContentViewDatabaseBinding,
} from '../apps/api/src/source-content-store.js';
import { sourceBlocks, selectSourceContent } from '../apps/api/src/source-content-view.js';
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
const policy = parseSourcePolicy({
  schemaVersion: 1,
  policyVersion: 'owned',
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
      notes: 'Owned engineering fixture.',
    },
  ],
});
it('requires matching database endpoints and distinct principals without exposing malformed connection strings', () => {
  const reader = 'postgresql://reader:owned@ep-child.example/db';
  expect(() =>
    assertContentViewDatabaseBinding(
      reader,
      'postgresql://writer:owned@ep-child-pooler.example:5432/db',
    ),
  ).not.toThrow();
  for (const writer of [
    'postgresql://writer:owned@ep-other.example/db',
    'postgresql://writer:owned@ep-child.example/other',
    'postgresql://%72eader:owned@ep-child.example/db',
    'malformed-owned-secret',
  ])
    expect(() => assertContentViewDatabaseBinding(reader, writer)).toThrow(
      'SOURCE_CONTENT_DATABASE_BINDING_INVALID',
    );
});
function fixture() {
  const text =
    '😀 لا يجوز حذف الشروط، إلا عند وجود الاستثناء.\n\n2. تصحيح محفوظ: يجوز للمسافر وإن لم يشق عليه.\n\n[ثان](https://example.com/fatwas/2/second)\n\n[تصنيف](https://example.com/categories/one)\n\n[ثالث](https://example.com/fatwas/3/third)\n\n[تصنيف آخر](https://example.com/categories/two)';
  const source: SourceEvidence = {
    snapshotKey: 'web-cache:' + sha256(text),
    sourceId: 'web-owned',
    sourceVersion: 'owned',
    sourceRole: 'scholar_explanation',
    reference: 'Owned',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned',
    author: null,
    edition: null,
    sourceUrl: 'https://example.com/public/one',
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: { sourcePolicySha256: policy.sha256, sourcePolicyVersion: 'owned' },
  };
  const { selection } = selectSourceContent(
    { ...source, sourceUrl: source.sourceUrl! },
    sourceBlocks(source).map((b) => ({ blockId: b.blockId, label: 'navigation' })),
    {
      modelId: 'owned',
      promptVersion: 'owned',
      requestSha256: 'b'.repeat(64),
      responseSha256: 'c'.repeat(64),
    },
  );
  let view: Record<string, unknown> | undefined;
  const passages: Record<string, unknown>[] = [];
  const query = vi.fn(async (sql: string, v: unknown[] = []) => {
    if (sql.startsWith('insert into basirah.research_page_content_view')) {
      view ??= {
        view_id: v[0],
        parent_snapshot_key: v[1],
        parent_sha256: v[2],
        selection: JSON.parse(v[6] as string),
        retained_ranges: JSON.parse(v[8] as string),
      };
      return { rows: [] };
    }
    if (sql.startsWith('select * from basirah.research_page_content_view'))
      return { rows: view ? [view] : [] };
    if (sql.startsWith('insert into basirah.research_page_content_passage')) {
      if (!passages.some((p) => p.passage_id === v[0]))
        passages.push({
          passage_id: v[0],
          view_id: v[1],
          start_utf16: v[2],
          end_utf16: v[3],
          core_start_utf16: v[4],
          core_end_utf16: v[5],
          start_codepoint: v[6],
          end_codepoint: v[7],
          core_start_codepoint: v[8],
          core_end_codepoint: v[9],
          original_text: v[10],
          passage_sha256: v[11],
          context_truncated: v[12],
          boundary_truncated: v[13],
          coverage: JSON.parse(v[14] as string),
        });
      return { rows: [] };
    }
    if (sql.startsWith('select * from basirah.research_page_content_passage'))
      return { rows: passages };
    if (sql.startsWith('with ranked'))
      return { rows: passages.slice(0, 3).map((p) => ({ ...p, ...view })) };
    return { rows: [] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  const store = createSourceContentStore({ readerPool: pool, writerPool: pool, policy });
  return { source, selection, store, query, passages };
}
it('stores sidecars idempotently, never updates originals or v1 vectors, and preserves complete corrective footnotes', async () => {
  const f = fixture(),
    before = structuredClone(f.source);
  const receipt = await f.store.store(f.source, f.selection);
  await f.store.store(f.source, f.selection);
  expect(receipt.contentCoverage.removedBlocks).toBe(4);
  expect(f.passages[0]!.original_text).toContain('تصحيح محفوظ');
  expect(f.passages[0]!.original_text).not.toContain('categories/');
  expect(f.source).toEqual(before);
  expect(
    f.query.mock.calls.some(
      ([sql]) => sql.startsWith('update') || sql.includes('research_page_passage_embedding'),
    ),
  ).toBe(false);
  await expect(
    f.store.store(f.source, { ...f.selection, responseSha256: 'f'.repeat(64) }),
  ).rejects.toThrow('SOURCE_CONTENT_VIEW_COLLISION');
});
it('enriches only the same ranked parent and carries verified body preferences while preserving an unindexed first hit', async () => {
  const f = fixture();
  await f.store.store(f.source, f.selection);
  const unindexed = {
    ...f.source,
    snapshotKey: 'web-cache:' + 'd'.repeat(64),
    originalText: 'تعريف الربا وبيان أنواعه',
    originalSha256: sha256('تعريف الربا وبيان أنواعه'),
  };
  const found = await f.store.enrich([unindexed, f.source], 'الشروط');
  expect(found.map((e) => e.snapshotKey)).toEqual([unindexed.snapshotKey, f.source.snapshotKey]);
  expect(found[0]).toEqual(unindexed);
  expect(found[1]!.originalText).toBe(f.source.originalText);
  expect(found[1]!.provenance.sourceContentSelection).toEqual(f.selection);
  expect(f.query.mock.calls.some(([sql]) => sql === 'begin read only')).toBe(true);
  f.passages[0]!.start_utf16 = 1;
  await expect(f.store.enrich([f.source], 'الشروط')).rejects.toThrow(
    'SOURCE_CONTENT_DELIVERY_BINDING_INVALID',
  );
});
it('rejects forged selections and revoked parents before any SQL', async () => {
  const f = fixture();
  await expect(
    f.store.store(f.source, { ...f.selection, selectionSha256: 'e'.repeat(64) }),
  ).rejects.toThrow();
  await expect(
    f.store.store({ ...f.source, approvalStatus: 'rejected' }, f.selection),
  ).rejects.toThrow('SOURCE_CONTENT_PARENT_INELIGIBLE');
  expect(f.query).not.toHaveBeenCalled();
});
it('does not begin any SQL after external cancellation', async () => {
  const f = fixture();
  await expect(f.store.store(f.source, f.selection, AbortSignal.abort())).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
