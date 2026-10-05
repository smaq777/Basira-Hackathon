import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonical, sha256 } from '../apps/api/src/foundation.js';
import { claimInventory, resolveClaimSelection } from '../apps/api/src/semantic-spans.js';
import { claimSelectionPacket } from '../apps/api/src/semantic-selection.js';
import {
  AliasedClaimSelectionOutputSchema,
  SelectionBindingDiagnosticsSchema,
} from '../packages/contracts/src/semantic-assessment.js';
import type { FoundationIntake, SourceEvidence } from '../packages/contracts/src/foundation.js';

// Owned synthetic text tests software boundaries; no scholarly labels or accuracy scores.
function source(text: string): SourceEvidence {
  return {
    snapshotKey: 'owned-source',
    sourceId: 'owned',
    sourceVersion: 'v1',
    sourceRole: 'book_excerpt',
    reference: 'owned:1',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned controls',
    author: null,
    edition: null,
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: {},
  };
}
function intake(
  text: string,
  original = source('يحفظ الكاتب الحقوق ما لم يتعذر ذلك.'),
): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned',
    corpusVersion: 'owned',
    revisionId: randomUUID(),
    revisionSha256: sha256(text),
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    evidence: [original],
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author',
        startOffset: 0,
        endOffset: text.length,
        codePointStart: 0,
        codePointEnd: Array.from(text).length,
        originalText: text,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'owned',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
  };
}
function modelResponse(payload: unknown, model: string) {
  return new Response(
    JSON.stringify({
      model,
      provider: 'owned',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }),
  );
}

describe('exact request-owned claim/evidence aliases', () => {
  it('maps aliases to original canonical spans and sources without exposing canonical selection keys', () => {
    const row = intake('😀 لا يلزم حفظ السجل إلا عند القدرة، ويلزم حفظ الحقوق فيما لا ضرر فيه.');
    row.evidence.push({
      ...source('لا يسقط الشرط.'),
      snapshotKey: 'owned-child',
      parentSnapshotKey: 'owned-source',
    });
    const inventory = claimInventory(row);
    const original = canonical(row);
    const packet = claimSelectionPacket(row, inventory);
    expect(packet.data.candidates[0]).toEqual({
      candidateId: 'C1',
      originalText: inventory.candidates[0]!.originalText,
      startOffset: inventory.candidates[0]!.startOffset,
      endOffset: inventory.candidates[0]!.endOffset,
    });
    expect(packet.data.evidenceManifest[1]!.parentSnapshotKey).toBe('E1');
    expect(packet.data.evidenceManifest[1]!.passages[0]!.evidenceKey).toBe('E2');
    expect(JSON.stringify(packet.data)).not.toContain('owned-source');
    const resolved = packet.resolve(
      { claims: [{ candidateId: 'C1', evidenceKeys: ['E2', 'E1'] }] },
      'initial',
    );
    expect(resolved.claims).toEqual(
      resolveClaimSelection(row, inventory, {
        claims: [
          {
            candidateId: inventory.candidates[0]!.id,
            evidenceKeys: ['owned-child', 'owned-source'],
          },
        ],
      }).claims,
    );
    expect(resolved.claims[0]!.originalText).toContain('لا يلزم');
    expect(resolved.claims[0]!.originalText).toContain('فيما لا ضرر فيه');
    expect(resolved.invalid).toBe(false);
    expect(SelectionBindingDiagnosticsSchema.parse(resolved.diagnostics).rejectedCount).toBe(0);
    expect(canonical(row)).toBe(original);
    expect(
      claimSelectionPacket(structuredClone(row), structuredClone(inventory)).aliasMapSha256,
    ).toBe(packet.aliasMapSha256);
  });
  it('freezes canonical lookup before asynchronous caller mutation', () => {
    const row = intake('لا يلزم حفظ السجل إلا عند القدرة.');
    const inventory = claimInventory(row);
    const packet = claimSelectionPacket(row, inventory);
    const original = inventory.candidates[0]!.originalText;
    inventory.candidates[0]!.originalText = 'changed';
    inventory.candidates[0]!.id = 'changed';
    row.evidence[0]!.snapshotKey = 'changed';
    packet.data.candidates[0]!.originalText = 'untrusted wire mutation';
    const resolved = packet.resolve(
      { claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }] },
      'initial',
    );
    expect(resolved.claims[0]!.originalText).toBe(original);
    expect(resolved.claims[0]!.evidenceKeys).toEqual(['owned-source']);
  });
  it.each([
    ['unknown_candidate_alias', [{ candidateId: 'C999', evidenceKeys: [] }], 1],
    ['unknown_evidence_alias', [{ candidateId: 'C1', evidenceKeys: ['E999'] }], 1],
    [
      'duplicate_candidate_alias',
      [
        { candidateId: 'C1', evidenceKeys: [] },
        { candidateId: 'C1', evidenceKeys: ['E1'] },
      ],
      2,
    ],
    ['duplicate_evidence_alias', [{ candidateId: 'C1', evidenceKeys: ['E1', 'E1'] }], 1],
  ] as const)('rejects %s without repair or a supported verdict', (code, claims, rejected) => {
    const row = intake('يجب حفظ الحقوق.');
    const resolved = claimSelectionPacket(row, claimInventory(row)).resolve({ claims }, 'initial');
    expect(resolved.invalid).toBe(true);
    expect(resolved.claims).toEqual([]);
    expect(resolved.diagnostics.rejectionCounts[code]).toBe(rejected);
    expect(resolved.diagnostics.rejectedCount).toBe(rejected);
    expect(JSON.stringify(resolved.diagnostics)).not.toContain('C999');
  });
  it('retains independent valid rows and distinguishes valid empty selection from invalid binding', () => {
    const row = intake('يجب حفظ الحقوق. يجب حفظ السجل.');
    const packet = claimSelectionPacket(row, claimInventory(row));
    expect(
      packet.resolve(
        {
          claims: [
            { candidateId: 'C999', evidenceKeys: [] },
            { candidateId: 'C2', evidenceKeys: [] },
          ],
        },
        'initial',
      ),
    ).toMatchObject({
      invalid: true,
      claims: [{ originalText: 'يجب حفظ السجل', evidenceKeys: [] }],
      diagnostics: { proposalCount: 2, acceptedCount: 1, rejectedCount: 1 },
    });
    expect(packet.resolve({ claims: [] }, 'empty_reconsideration')).toMatchObject({
      invalid: false,
      claims: [],
      diagnostics: { attempt: 'empty_reconsideration', rejectedCount: 0 },
    });
  });
  it('strictly rejects canonical IDs, altered spellings and extra fields at the wire boundary', () => {
    for (const candidateId of ['claim-' + '0'.repeat(24), 'c1', 'C01', 'C1 '])
      expect(
        AliasedClaimSelectionOutputSchema.safeParse({ claims: [{ candidateId, evidenceKeys: [] }] })
          .success,
      ).toBe(false);
    expect(
      AliasedClaimSelectionOutputSchema.safeParse({
        claims: [{ candidateId: 'C1', evidenceKeys: [], originalText: 'replacement' }],
      }).success,
    ).toBe(false);
  });
});
