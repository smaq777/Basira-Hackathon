import { describe, expect, it } from 'vitest';
import { relevancePacket, RELEVANCE_INSTRUCTION } from '../apps/api/src/semantic-relevance.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
import type { SemanticClaim } from '../packages/contracts/src/semantic-assessment.js';

const claim = {
  id: 'claim-owned',
  originalText: 'يستحب إعلان النكاح',
  evidenceKeys: ['unrelated', 'relevant'],
} as SemanticClaim;
function source(
  key: string,
  text: string,
  parentSnapshotKey: string | null = null,
): SourceEvidence {
  return {
    snapshotKey: key,
    sourceId: key,
    sourceVersion: 'owned',
    sourceRole: parentSnapshotKey ? 'tafsir_commentary' : 'quran_text',
    reference: 'owned:1',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned synthetic control',
    author: null,
    edition: null,
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey,
    delivery: 'snapshot',
    retrievalModes: ['semantic'],
    provenance: {},
  };
}
describe('claim-specific relevance identity binding', () => {
  const evidence = [
    source('unrelated', 'Owned control about another event'),
    source('relevant', 'Owned contrary evidence about the exact action'),
  ];
  it('retains selected contradictory evidence and rejects topic-only candidates', () => {
    const packet = relevancePacket([{ claim, evidence }], 'Original draft');
    expect(packet.data.claims[0]!.evidence.map((row) => row.evidenceKey)).toEqual(['E1', 'E2']);
    expect(
      packet.resolve({ selections: [{ claimId: 'C1', evidenceKeys: ['E2'] }] })[0]!.evidenceKeys,
    ).toEqual(['relevant']);
    expect(RELEVANCE_INSTRUCTION).toContain('Keep relevant contradictions');
    expect(RELEVANCE_INSTRUCTION).toContain('asserted core action or proposition');
    expect(RELEVANCE_INSTRUCTION).toContain(
      'Marriage companionship, love or mercy alone is not relevant',
    );
  });
  it('permits no relevant evidence without inventing a substitute', () => {
    expect(
      relevancePacket([{ claim, evidence }], '').resolve({
        selections: [{ claimId: 'C1', evidenceKeys: [] }],
      })[0]!.evidenceKeys,
    ).toEqual([]);
  });
  it.each([
    { selections: [] },
    { selections: [{ claimId: 'C2', evidenceKeys: [] }] },
    { selections: [{ claimId: 'C1', evidenceKeys: ['E99'] }] },
    { selections: [{ claimId: 'C1', evidenceKeys: ['E1', 'E1'] }] },
    {
      selections: [
        { claimId: 'C1', evidenceKeys: [] },
        { claimId: 'C1', evidenceKeys: [] },
      ],
    },
  ])('fails closed for invalid or incomplete selection %j', (output) => {
    expect(() => relevancePacket([{ claim, evidence }], '').resolve(output)).toThrow();
  });
  it('keeps canonical parent context but not unselected sibling commentary', () => {
    const family = [
      source('parent', 'Parent context'),
      source('child', 'Relevant commentary', 'parent'),
      source('sibling', 'Other commentary', 'parent'),
    ];
    const result = relevancePacket([{ claim, evidence: family }], '').resolve({
      selections: [{ claimId: 'C1', evidenceKeys: ['E2'] }],
    });
    expect(result[0]!.evidenceKeys).toEqual(['child', 'parent']);
  });
  it('does not allow a source alias from another claim packet', () => {
    const packet = relevancePacket(
      [
        { claim, evidence: [evidence[0]!] },
        { claim: { ...claim, id: 'other' }, evidence },
      ],
      '',
    );
    expect(() =>
      packet.resolve({
        selections: [
          { claimId: 'C1', evidenceKeys: ['E2'] },
          { claimId: 'C2', evidenceKeys: [] },
        ],
      }),
    ).toThrow();
  });
});
