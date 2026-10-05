import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SourceCorpusManifestSchema,
  assertFrozenCorpusRelations,
} from '../apps/api/src/source-corpus-ingestion.js';
import { normalizeCorpusSearch } from '../apps/api/src/hosted-corpus.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const originalText = 'إنَّ التوحيدَ أساسٌ؛ لا يُسقطُ شرطًا.';
const source = {
  snapshotKey: 'owned-synthetic:1',
  sourceId: 'owned-synthetic',
  sourceVersion: 'v1',
  sourceRole: 'book_excerpt',
  reference: 'page:1',
  originalText,
  originalSha256: hash(originalText),
  work: 'Owned synthetic fixture',
  author: null,
  edition: null,
  sourceUrl: null,
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'snapshot',
  retrievalModes: ['lexical'],
  provenance: { fixture: true },
  rightsRecord: 'Owned synthetic fixture',
  contextBefore: 'Synthetic preceding context',
  footnotes: [],
};
const manifest = () => ({
  schemaVersion: 1,
  corpusVersion: 'synthetic-v1',
  sources: [{ ...source }],
});
describe('typed corpus ingestion boundary', () => {
  it('rejects relationship additions, removals or changed attribution on frozen snapshots', () => {
    const one = {
      targetSnapshotKey: 'verse:1',
      relationType: 'comments_on',
      provenance: { source: 'explicit_parent_snapshot' },
    };
    const two = {
      targetSnapshotKey: 'verse:2',
      relationType: 'quotes',
      provenance: { source: 'original citation' },
    };
    expect(() => assertFrozenCorpusRelations([one, two], [two, one])).not.toThrow();
    expect(() => assertFrozenCorpusRelations([one], [one, two])).toThrow(
      'RELATION_IDENTITY_COLLISION',
    );
    expect(() => assertFrozenCorpusRelations([one], [])).toThrow('RELATION_IDENTITY_COLLISION');
    expect(() =>
      assertFrozenCorpusRelations([one], [{ ...one, provenance: { source: 'changed' } }]),
    ).toThrow('RELATION_IDENTITY_COLLISION');
  });
  it('preserves untouched originals, context and explicit source roles', () => {
    const parsed = SourceCorpusManifestSchema.parse(manifest());
    expect(parsed.sources[0]?.originalText).toBe(originalText);
    expect(parsed.sources[0]?.contextBefore).toBe(source.contextBefore);
    expect(normalizeCorpusSearch(originalText)).toBe('ان التوحيد اساس لا يسقط شرطا');
  });
  it('requires pending research sources and never grants approval through ingestion', () => {
    expect(
      SourceCorpusManifestSchema.safeParse({
        ...manifest(),
        sources: [{ ...source, approvalStatus: 'approved', researchOnly: false }],
      }).success,
    ).toBe(false);
  });
  it('rejects tampered originals and footnotes', () => {
    expect(
      SourceCorpusManifestSchema.safeParse({
        ...manifest(),
        sources: [{ ...source, originalText: 'changed' }],
      }).success,
    ).toBe(false);
    expect(
      SourceCorpusManifestSchema.safeParse({
        ...manifest(),
        sources: [
          {
            ...source,
            footnotes: [
              { reference: '1', originalText: 'footnote', originalSha256: hash('different') },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects mismatched vectors and duplicate snapshot bindings', () => {
    const embeddingSpace = { modelId: 'fixture', dimensions: 3, taskType: 'search_document' };
    expect(
      SourceCorpusManifestSchema.safeParse({
        ...manifest(),
        embeddingSpace,
        embeddings: [
          {
            snapshotKey: source.snapshotKey,
            originalSha256: source.originalSha256,
            embedding: [1, 0],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      SourceCorpusManifestSchema.safeParse({ ...manifest(), sources: [source, source] }).success,
    ).toBe(false);
  });
  it('accepts separately attributed scholar explanations and typed cross-work links', () => {
    expect(
      SourceCorpusManifestSchema.safeParse({
        ...manifest(),
        sources: [
          {
            ...source,
            sourceRole: 'scholar_explanation',
            relations: [
              {
                targetSnapshotKey: 'other-work:1',
                relationType: 'comments_on',
                provenance: { attribution: 'explicit citation' },
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });
});
