import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonical, sha256, validateIntake } from '../apps/api/src/foundation.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';

function fixture(): FoundationIntake {
  const text = '🙂 لا إكراه في الدين';
  return {
    schemaVersion: 1,
    pipelineVersion: 'test-v1',
    revisionId: randomUUID(),
    revisionSha256: sha256(text),
    corpusVersion: 'test',
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    segments: [
      {
        id: 's1',
        startOffset: 3,
        endOffset: text.length,
        codePointStart: 2,
        codePointEnd: Array.from(text).length,
        originalText: text.slice(3),
        role: 'ayah',
        roleStatus: 'source_matched',
        method: 'verified-original',
        sourceKeys: ['q1'],
        roleProposal: 'matn',
        conflict: true,
      },
    ],
    evidence: [
      {
        snapshotKey: 'q1',
        sourceId: 'tanzil',
        sourceVersion: '1.1',
        sourceRole: 'quran_text',
        reference: '2:256',
        originalText: text.slice(3),
        originalSha256: sha256(text.slice(3)),
        work: 'Quran',
        author: null,
        edition: null,
        sourceUrl: 'https://tanzil.net/',
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: null,
        delivery: 'snapshot',
        retrievalModes: ['exact'],
        provenance: { fixture: true },
      },
    ],
    quotationFindings: [
      {
        segmentId: 's1',
        evidenceKey: 'q1',
        status: 'exact',
        reason: 'fixture',
        matchedStart: 0,
        matchedEnd: text.slice(3).length,
      },
    ],
    contextCoverage: [],
    warnings: [],
  };
}

it('binds original text, both offset units, source hashes and literal evidence despite role-model disagreement', () => {
  const value = fixture();
  expect(validateIntake(value, value.originalText, value.revisionId, true)).toEqual(value);
});
it('rejects changed draft and research evidence without explicit operator preview', () => {
  const value = fixture();
  expect(() => validateIntake(value, value.originalText + '!', value.revisionId, true)).toThrow();
  expect(() => validateIntake(value, value.originalText, value.revisionId, false)).toThrow();
});
it('rejects forged originals, orphan footnotes, detached citations and split surrogate spans', () => {
  for (const mutate of [
    (value: FoundationIntake) => {
      value.evidence[0]!.originalText += '!';
    },
    (value: FoundationIntake) => {
      value.evidence[0]!.sourceRole = 'tafsir_footnote';
    },
    (value: FoundationIntake) => {
      value.quotationFindings[0]!.evidenceKey = 'missing';
    },
    (value: FoundationIntake) => {
      value.segments[0]!.startOffset = 1;
    },
    (value: FoundationIntake) => {
      value.segments[0]!.codePointStart = 1;
    },
    (value: FoundationIntake) => {
      value.evidence.push(value.evidence[0]!);
    },
  ]) {
    const value = fixture();
    mutate(value);
    expect(() => validateIntake(value, value.originalText, value.revisionId, true)).toThrow();
  }
});
it('hashes equivalent object key order identically without normalizing Arabic originals', () => {
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  expect(sha256('آية')).not.toBe(sha256('اية'));
});
