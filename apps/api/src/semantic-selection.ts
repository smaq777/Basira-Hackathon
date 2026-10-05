import type { FoundationIntake } from '../../../packages/contracts/src/foundation.js';
import {
  AliasedClaimSelectionOutputSchema,
  type SelectionBindingDiagnostics,
} from '../../../packages/contracts/src/semantic-assessment.js';
import { canonical, sha256 } from './foundation.js';
import { evidencePassages, resolveClaimSelection, type ClaimInventory } from './semantic-spans.js';

/** Short wire identities map exactly to one frozen canonical packet, never by similarity. */
export function claimSelectionPacket(intake: FoundationIntake, inventory: ClaimInventory) {
  const ownedIntake = structuredClone(intake);
  const ownedInventory = structuredClone(inventory);
  const candidates = new Map(ownedInventory.candidates.map((row, i) => [`C${i + 1}`, row.id]));
  const evidence = new Map(ownedIntake.evidence.map((row, i) => [`E${i + 1}`, row.snapshotKey]));
  if (
    new Set(candidates.values()).size !== candidates.size ||
    new Set(evidence.values()).size !== evidence.size
  )
    throw new Error('AMBIGUOUS_SELECTION_IDENTITIES');
  const evidenceAlias = new Map([...evidence].map(([alias, key]) => [key, alias]));
  const aliasMapSha256 = sha256(
    canonical({ candidates: [...candidates], evidence: [...evidence] }),
  );
  const data = {
    selectionProtocol: 'exact-selection-alias-v1' as const,
    revisionId: ownedIntake.revisionId,
    inputSha256: ownedIntake.revisionSha256,
    draft: ownedIntake.originalText,
    candidates: ownedInventory.candidates.map((row, i) => ({
      candidateId: `C${i + 1}`,
      originalText: row.originalText,
      startOffset: row.startOffset,
      endOffset: row.endOffset,
    })),
    evidenceManifest: ownedIntake.evidence.map((row, i) => ({
      evidenceKey: `E${i + 1}`,
      sourceRole: row.sourceRole,
      reference: row.reference,
      work: row.work,
      parentSnapshotKey: row.parentSnapshotKey
        ? (evidenceAlias.get(row.parentSnapshotKey) ?? null)
        : null,
      passages: evidencePassages(
        row,
        ownedInventory.candidates.map((candidate) => candidate.originalText).join(' '),
      ).map((passage) => ({ ...passage, evidenceKey: `E${i + 1}` })),
    })),
  };
  const resolve = (payload: unknown, attempt: SelectionBindingDiagnostics['attempt']) => {
    const proposals = AliasedClaimSelectionOutputSchema.parse(payload).claims;
    const counts: SelectionBindingDiagnostics['rejectionCounts'] = {
      unknown_candidate_alias: 0,
      unknown_evidence_alias: 0,
      duplicate_candidate_alias: 0,
      duplicate_evidence_alias: 0,
    };
    const duplicateCandidates = new Set(
      proposals
        .filter(
          (row, i) => proposals.findIndex((other) => other.candidateId === row.candidateId) !== i,
        )
        .map((row) => row.candidateId),
    );
    const translated: Array<{ candidateId: string; evidenceKeys: string[] }> = [];
    for (const row of proposals) {
      let rejected = false;
      const reject = (code: keyof typeof counts) => {
        counts[code]++;
        rejected = true;
      };
      if (!candidates.has(row.candidateId)) reject('unknown_candidate_alias');
      if (duplicateCandidates.has(row.candidateId)) reject('duplicate_candidate_alias');
      if (row.evidenceKeys.some((key) => !evidence.has(key))) reject('unknown_evidence_alias');
      if (new Set(row.evidenceKeys).size !== row.evidenceKeys.length)
        reject('duplicate_evidence_alias');
      if (!rejected)
        translated.push({
          candidateId: candidates.get(row.candidateId)!,
          evidenceKeys: row.evidenceKeys.map((key) => evidence.get(key)!),
        });
    }
    // Original canonical span/source guards are the final authority.
    const resolved = resolveClaimSelection(ownedIntake, ownedInventory, { claims: translated });
    const rejectedCount = proposals.length - translated.length;
    return {
      claims: resolved.claims,
      invalid: rejectedCount > 0 || resolved.invalid,
      diagnostics: {
        protocol: 'exact-selection-alias-v1' as const,
        attempt,
        aliasMapSha256,
        payloadSha256: sha256(canonical(payload)),
        proposalCount: proposals.length,
        acceptedCount: resolved.claims.length,
        rejectedCount,
        rejectionCounts: counts,
      },
    };
  };
  return { data, aliasMapSha256, resolve };
}
