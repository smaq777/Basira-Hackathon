import { describe, expect, it } from 'vitest';
import { compileResearchBatch } from '../apps/api/src/research-batch-compiler.js';
import { sha256 } from '../apps/api/src/foundation.js';

function fixture() {
  const sourceVersion = sha256('publisher file');
  const make = (reference: string, tafsir = false) => {
    const sourceRole = tafsir ? 'tafsir_commentary' : 'quran_text';
    const id = tafsir
      ? `kfgqpc-muyassar-v3:${reference}:tafsir`
      : `tanzil-uthmani-v1.1:${reference}`;
    const originalText = tafsir
      ? '<p>قولٌ كاملٌ، بشرط الوفاء؛ إلا عند العذر.</p>'
      : 'نصٌّ اصطناعيٌّ غير قرآنيّ.';
    const originalSha256 = sha256(originalText);
    return {
      source: {
        snapshotKey: id,
        sourceId: tafsir ? 'kfgqpc-muyassar-v3-fixture' : 'tanzil-uthmani-v1.1',
        sourceVersion,
        sourceRole,
        reference,
        originalText,
        originalSha256,
        work: 'Owned fixture',
        author: null,
        edition: 'Fixture edition',
        sourceUrl: 'https://example.com/original',
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: tafsir ? `tanzil-uthmani-v1.1:${reference}` : null,
        delivery: 'snapshot',
        retrievalModes: ['exact', 'lexical'],
        provenance: {
          source_version: sourceVersion,
          source_role: sourceRole,
          source_id: tafsir ? 'kfgqpc-muyassar-v3' : 'tanzil-uthmani-v1.1',
        },
        rightsRecord: 'Owned synthetic test; no Quran authenticity claim',
        contextBefore: 'Full neighbor before',
        contextAfter: 'Full neighbor after',
      },
      originalRecord: { id, reference, sourceRole, sourceVersion, originalText, originalSha256 },
      seedTopic: 'family',
      classification: {
        topics: ['other'],
        modelId: 'fixture-model',
        promptVersion: 'fixture-v1',
        requestSha256: sha256('request'),
        responseSha256: sha256('response'),
      },
    };
  };
  return {
    baseline: {
      schemaVersion: 1,
      corpusVersion: 'frozen-baseline',
      sources: [make('1:1').source, make('1:1', true).source],
    },
    additions: [make('2:282'), make('2:282', true)],
  };
}

describe('bounded original research compiler', () => {
  it('preserves baseline, full original HTML, neighbors and parent while separating topics from kind', () => {
    const input = fixture();
    const result = compileResearchBatch(input);
    expect(result.manifest.sources[0]).toEqual(input.baseline.sources[0]);
    const commentary = result.manifest.sources.find(
      (row) => row.snapshotKey === 'kfgqpc-muyassar-v3:2:282:tafsir',
    )!;
    expect(commentary.originalText).toBe(input.additions[1]!.source.originalText);
    expect(commentary.contextBefore).toBe('Full neighbor before');
    expect(commentary.parentSnapshotKey).toBe('tanzil-uthmani-v1.1:2:282');
    expect(commentary.provenance.researchBatch).toMatchObject({
      seedTopic: 'family',
      topicProposal: { topics: ['other'] },
      topicStatus: 'proposed',
    });
    expect(result.diagnostics.newCount).toBe(2);
  });
  it('is invariant to input order and deduplicates identical inputs, retaining equal text at distinct locators', () => {
    const input = fixture();
    const first = compileResearchBatch(input);
    const second = compileResearchBatch({ ...input, additions: [...input.additions].reverse() });
    expect(second.manifest).toEqual(first.manifest);
    const duplicate = compileResearchBatch({
      ...input,
      additions: [...input.additions, input.additions[0]!],
    });
    expect(duplicate.manifest).toEqual(first.manifest);
    expect(duplicate.diagnostics.repeatedInputs).toBe(1);
    expect(first.diagnostics.repeatedOriginalHashes).toBe(2);
  });
  it('rejects rewriting the original even when a caller recomputes its hash', () => {
    const input = fixture();
    input.additions[1]!.source.originalText = 'condition removed';
    input.additions[1]!.source.originalSha256 = sha256('condition removed');
    expect(() => compileResearchBatch(input)).toThrow('BATCH_ORIGINAL_BINDING_MISMATCH');
  });
  it('rejects unknown topics, benchmark origins, source approval and oversized batches', () => {
    const input = fixture();
    expect(() =>
      compileResearchBatch({
        ...input,
        additions: [{ ...input.additions[0], seedTopic: 'invented' }],
      }),
    ).toThrow();
    input.additions[0]!.originalRecord.id = 'IslamicEval-gold:1';
    expect(() => compileResearchBatch(input)).toThrow();
    expect(() =>
      compileResearchBatch({
        ...fixture(),
        additions: Array.from({ length: 41 }, () => fixture().additions[0]),
      }),
    ).toThrow();
    const approved = fixture();
    approved.additions[0]!.source.approvalStatus = 'approved';
    expect(() => compileResearchBatch(approved)).toThrow();
  });
  it('rejects mismatched verse parents and changes to a reused edition or frozen source', () => {
    const input = fixture();
    input.additions[1]!.source.parentSnapshotKey = 'tanzil-uthmani-v1.1:1:1';
    expect(() => compileResearchBatch(input)).toThrow('BATCH_COMMENTARY_PARENT_INVALID');
    const edition = fixture();
    edition.additions[0]!.source.rightsRecord = 'changed rights';
    expect(() => compileResearchBatch(edition)).toThrow('BATCH_EDITION_IDENTITY_MISMATCH');
    const fakeId = fixture();
    fakeId.additions[0]!.source.sourceId = 'unknown-source';
    expect(() => compileResearchBatch(fakeId)).toThrow('BATCH_EDITION_IDENTITY_MISMATCH');
    const fakeVersion = fixture();
    const version = sha256('unknown edition');
    fakeVersion.additions[0]!.source.sourceVersion = version;
    fakeVersion.additions[0]!.source.provenance.source_version = version;
    fakeVersion.additions[0]!.originalRecord.sourceVersion = version;
    expect(() => compileResearchBatch(fakeVersion)).toThrow('BATCH_EDITION_IDENTITY_MISMATCH');
    const prior = fixture();
    prior.additions = [
      {
        ...prior.additions[0]!,
        source: prior.baseline.sources[0]!,
        originalRecord: {
          ...prior.additions[0]!.originalRecord,
          id: 'tanzil-uthmani-v1.1:1:1',
          reference: '1:1',
        },
      },
    ];
    expect(() => compileResearchBatch(prior)).toThrow('BATCH_SOURCE_ALREADY_IN_BASELINE');
  });
});
