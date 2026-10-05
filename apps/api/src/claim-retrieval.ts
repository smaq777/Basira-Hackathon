import type {
  FoundationIntake,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import type {
  SemanticClaim,
  CachePassagePreference,
} from '../../../packages/contracts/src/semantic-assessment.js';
import { SourceEvidenceSchema } from '../../../packages/contracts/src/foundation.js';
import { canonical, sha256 } from './foundation.js';
import { evidencePacketFits } from './evidence-budget.js';
import {
  bindCachePassageHits,
  mergeCachePassageHits,
  cachePassagePreference,
  stripCachePassageProvenance,
} from './research-page-passages.js';

export interface ClaimRetrievalTrace {
  corpusVersion: string;
  mode: 'approved' | 'local_research';
  passagePreferences?: CachePassagePreference[];
  queries: Array<{
    claimId: string;
    querySha256: string;
    modes: Array<'exact' | 'lexical' | 'semantic'>;
    candidateKeys: string[];
  }>;
}
export interface ClaimRetrievalAdapter {
  retrieve(
    intake: FoundationIntake,
    claims: readonly SemanticClaim[],
    signal?: AbortSignal,
  ): Promise<{ evidence: SourceEvidence[]; claims: SemanticClaim[]; trace: ClaimRetrievalTrace }>;
}
export interface ClaimGapDiscovery {
  discover(
    claim: SemanticClaim,
    gap: { reason: 'not_established' | 'insufficient_context'; query: string },
    signal?: AbortSignal,
  ): Promise<{ evidence: SourceEvidence[]; failureCodes: string[] }>;
}
export interface ClaimCorpusSearch {
  search(
    query: string,
    references: readonly string[],
    signal?: AbortSignal,
  ): Promise<SourceEvidence[]>;
  restore(keys: readonly string[], signal?: AbortSignal): Promise<SourceEvidence[]>;
}

/** Searches whole assertions and bounded content terms; never searches only for agreement. */
export function claimQueries(text: string): string[] {
  const words =
    text
      .normalize('NFKC')
      .replace(/[\u064b-\u065f\u0670ـ]/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  // One complete assertion preserves qualifiers and avoids embedding near-identical
  // variants. Long compound spans additionally search their two content halves.
  if (words.length < 24) return [text];
  const midpoint = Math.ceil(words.length / 2);
  return [...new Set([text, words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')])];
}
export function createClaimRetrievalAdapter(options: {
  corpus: ClaimCorpusSearch;
  corpusVersion: string;
  researchPreview?: boolean;
  maxCandidatesPerClaim?: number;
  reserveDiscoveryKeys?: boolean;
}): ClaimRetrievalAdapter {
  const max = options.maxCandidatesPerClaim ?? 8;
  const claimLimit = options.reserveDiscoveryKeys ? 18 : 20;
  const evidenceLimit = options.reserveDiscoveryKeys ? 78 : 80;
  if (!Number.isInteger(max) || max < 1 || max > 12) throw new Error('INVALID_RETRIEVAL_BOUND');
  return {
    async retrieve(intake, claims, signal) {
      const groupController = new AbortController();
      signal = AbortSignal.any([groupController.signal, ...(signal ? [signal] : [])]);
      const evidence = new Map(intake.evidence.map((row) => [row.snapshotKey, row]));
      const trace: ClaimRetrievalTrace = {
        corpusVersion: options.corpusVersion,
        mode: options.researchPreview ? 'local_research' : 'approved',
        queries: [],
      };
      const identity = (row: SourceEvidence) =>
        canonical({
          snapshotKey: row.snapshotKey,
          sourceId: row.sourceId,
          sourceVersion: row.sourceVersion,
          sourceRole: row.sourceRole,
          reference: row.reference,
          originalText: row.originalText,
          originalSha256: row.originalSha256,
          work: row.work,
          author: row.author,
          edition: row.edition,
          sourceUrl: row.sourceUrl,
          parentSnapshotKey: row.parentSnapshotKey,
        });
      const eligible = (raw: SourceEvidence) => {
        const row = SourceEvidenceSchema.parse(raw);
        if (sha256(row.originalText) !== row.originalSha256)
          throw new Error('RETRIEVAL_HASH_MISMATCH');
        if (
          row.approvalStatus !== 'approved' &&
          !(options.researchPreview && row.approvalStatus === 'pending')
        )
          return false;
        if (!options.researchPreview && row.researchOnly) return false;
        const previous = evidence.get(row.snapshotKey);
        if (previous && identity(previous) !== identity(row))
          throw new Error('RETRIEVAL_IDENTITY_COLLISION');
        return true;
      };
      const searchPlans = claims.flatMap((claim) => {
        const references = intake.evidence
          .filter((row) => claim.evidenceKeys.includes(row.snapshotKey))
          .map((row) => row.reference);
        return claimQueries(claim.originalText).map((query) => ({ claim, query, references }));
      });
      const searchRows: SourceEvidence[][] = new Array(searchPlans.length);
      let cursor = 0;
      // At most three provider/SQL searches are active. Results merge by plan order,
      // never completion order, preserving deterministic packets and identities.
      try {
        await Promise.all(
          Array.from({ length: Math.min(3, searchPlans.length) }, async () => {
            while (cursor < searchPlans.length) {
              signal?.throwIfAborted();
              const index = cursor++;
              const plan = searchPlans[index]!;
              searchRows[index] = await options.corpus.search(plan.query, plan.references, signal);
            }
          }),
        );
      } catch (error) {
        groupController.abort();
        throw error;
      }
      signal?.throwIfAborted();
      const candidateSets = claims.map((claim) => {
        const candidates = new Map<string, SourceEvidence>();
        searchPlans.forEach((plan, index) => {
          if (plan.claim.id !== claim.id) return;
          const accepted: SourceEvidence[] = [];
          for (const raw of searchRows[index]!) {
            const row = bindCachePassageHits(raw, claim.originalText, plan.query);
            if (!candidates.has(row.snapshotKey) && candidates.size >= max) continue;
            if (eligible(row)) {
              const prior = candidates.get(row.snapshotKey);
              if (prior && identity(prior) !== identity(row))
                throw Error('RETRIEVAL_IDENTITY_COLLISION');
              candidates.set(row.snapshotKey, prior ? mergeCachePassageHits(prior, row) : row);
              accepted.push(row);
            }
          }
          trace.queries.push({
            claimId: claim.id,
            querySha256: sha256(plan.query),
            modes: [...new Set(accepted.flatMap((row) => row.retrievalModes))],
            candidateKeys: accepted.map((row) => row.snapshotKey).slice(0, 12),
          });
        });
        return candidates;
      });
      const restoreKeys = [
        ...new Set(
          claims.flatMap((claim, index) => [
            ...claim.evidenceKeys,
            ...candidateSets[index]!.keys(),
          ]),
        ),
      ];
      const restored = await options.corpus.restore(restoreKeys, signal);
      signal?.throwIfAborted();
      const boundClaims: SemanticClaim[] = [];
      const preferences: CachePassagePreference[] = [];
      for (const [index, claim] of claims.entries()) {
        const keys = new Set(claim.evidenceKeys);
        const candidates = candidateSets[index]!;
        const available = new Map(evidence);
        for (const row of [...candidates.values(), ...restored])
          if (eligible(row)) {
            const previous = available.get(row.snapshotKey);
            if (previous && identity(previous) !== identity(row))
              throw new Error('RETRIEVAL_IDENTITY_COLLISION');
            available.set(
              row.snapshotKey,
              previous ? mergeCachePassageHits(previous, row, true) : row,
            );
          }
        const familyFor = (key: string) => {
          const family = new Set([key]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const row of available.values()) {
              const links = [
                row.parentSnapshotKey,
                ...(row.relations ?? []).map((link) => link.targetSnapshotKey),
              ].filter((link): link is string => !!link);
              if (family.has(row.snapshotKey) || links.some((link) => family.has(link))) {
                for (const linked of [
                  row.snapshotKey,
                  ...links.filter((link) => available.has(link)),
                ])
                  if (!family.has(linked)) {
                    family.add(linked);
                    changed = true;
                  }
              }
            }
          }
          return [...family]
            .map((linked) => available.get(linked))
            .filter((row): row is SourceEvidence => !!row);
        };
        for (const key of [...keys, ...candidates.keys()]) {
          const family = familyFor(key);
          if (family.some((row) => row.parentSnapshotKey && !available.has(row.parentSnapshotKey)))
            continue;
          const newClaimKeys = family.filter((row) => !keys.has(row.snapshotKey));
          const newEvidence = family.filter((row) => !evidence.has(row.snapshotKey));
          const nextClaimSize = keys.size + newClaimKeys.length;
          const nextEvidenceSize = evidence.size + newEvidence.length;
          if (
            newEvidence.length &&
            !evidencePacketFits(intake, [...evidence.values(), ...newEvidence])
          ) {
            if (claim.evidenceKeys.includes(key)) throw new Error('RETRIEVAL_PACKET_TOO_LARGE');
            continue;
          }
          if (nextClaimSize > 20 || nextEvidenceSize > 80) {
            if (claim.evidenceKeys.includes(key)) throw new Error('RETRIEVAL_PACKET_TOO_LARGE');
            continue;
          }
          if (
            (nextClaimSize > claimLimit || nextEvidenceSize > evidenceLimit) &&
            !claim.evidenceKeys.includes(key)
          )
            continue;
          // Seeded original families are indivisible even when they use the
          // reserved slots. The semantic stage then skips web acquisition visibly.

          for (const row of family) {
            keys.add(row.snapshotKey);
            if (!evidence.has(row.snapshotKey))
              evidence.set(row.snapshotKey, stripCachePassageProvenance(row));
          }
        }
        const boundClaim = { ...claim, evidenceKeys: [...keys] };
        for (const key of keys) {
          const row = available.get(key);
          if (row) {
            const p = cachePassagePreference(row, boundClaim);
            if (p) preferences.push(p);
          }
        }
        boundClaims.push(boundClaim);
      }
      if (preferences.length) trace.passagePreferences = preferences;
      return { claims: boundClaims, evidence: [...evidence.values()], trace };
    },
  };
}
