import { z } from 'zod';
import { canonical, sha256 } from './foundation.js';
import type { assessorEvidence } from './semantic-spans.js';
import {
  EvidenceSupportFindingSchema,
  EvidenceSupportOutputSchema,
  type SemanticClaim,
} from '../../../packages/contracts/src/semantic-assessment.js';

export const IMMUTABLE_PASSAGE_PROTOCOL = 'immutable-passage-v1';
export const IMMUTABLE_PASSAGE_INSTRUCTION =
  "Assessment wire protocol immutable-passage-v1. Return exactly one assessment per supplied C claim alias. For a claim with evidence, citations are only {passageId} selections from that claim's supplied P aliases; never return evidenceKey or excerpt, reproduce source text, join spans, omit inline footnotes or reconstruct canonical IDs. The server resolves each selected P alias to the complete exact immutable originalText of that supplied contiguous passage, including all inline markers and footnotes. Select only passages that substantiate the actual finding; passage selection never establishes truth by itself. Do not cite a passage belonging to another claim. If a claim has evidence:[], return ONLY {claimId,status}, where status is insufficient_context for unavailable evidence or not_applicable for an assertion outside this religious evidence-review scope. Never return not_established, supported, contradicted, citations, explanation or source-derived details for evidence:[]. The server writes the bounded unavailable/classification explanation after your choice. Do not use not_applicable merely because evidence is missing. With nonempty evidence preserve all original relation, qualification and explanation requirements. Unsupported/contradicted still require the original support rules; supported/contradicted require a selected passage.";

type ClaimPacket = {
  claim: SemanticClaim;
  evidence: ReturnType<typeof assessorEvidence>[];
  [key: string]: unknown;
};
type AssessmentData = { claims: ClaimPacket[]; [key: string]: unknown };
type WireFinding = {
  claimId: string;
  status:
    'supported' | 'contradicted' | 'not_established' | 'insufficient_context' | 'not_applicable';
  conditions?: string[];
  negations?: string[];
  exceptions?: string[];
  scope?: string[];
  citations?: { passageId: string }[];
  explanation?: string;
};

/** Strict request-owned selectors. Old free-text citations are never repaired or accepted here. */
export function assessmentCitationPacket(data: AssessmentData) {
  const owned = structuredClone(data);
  if (!owned.claims.length || owned.claims.length > 5) throw Error('INVALID_ASSESSMENT_PACKET');
  const canonicalClaims = new Set<string>();
  const bindings = new Map<
    string,
    {
      claim: SemanticClaim;
      empty: boolean;
      passages: Map<string, { evidenceKey: string; originalText: string }>;
    }
  >();
  const branches: z.ZodType[] = [];
  const aliasMap: unknown[] = [];
  let count = 0;
  const claims = owned.claims.map((packet, index) => {
    const alias = `C${index + 1}`,
      passages = new Map<string, { evidenceKey: string; originalText: string }>();
    if (canonicalClaims.has(packet.claim.id) || packet.evidence.length > 20)
      throw Error('INVALID_ASSESSMENT_PACKET');
    canonicalClaims.add(packet.claim.id);
    aliasMap.push([alias, packet.claim.id]);
    const seen = new Set<string>();
    const evidence = packet.evidence.map((source) => ({
      ...source,
      passages: source.passages.map((passage) => {
        if (
          !passage.originalText ||
          passage.originalText.length > 4000 ||
          passage.endOffset - passage.startOffset !== passage.originalText.length ||
          !Number.isInteger(passage.startOffset) ||
          passage.startOffset < 0 ||
          !Number.isInteger(passage.endOffset) ||
          passage.evidenceKey !== source.evidenceKey ||
          passage.originalSha256 !== source.originalSha256 ||
          count >= 300
        )
          throw Error('INVALID_ASSESSMENT_PASSAGE');
        const identity = canonical([source.evidenceKey, passage.passageId]);
        if (seen.has(identity)) throw Error('AMBIGUOUS_ASSESSMENT_PASSAGE');
        seen.add(identity);
        const passageAlias = `P${++count}`;
        passages.set(passageAlias, {
          evidenceKey: source.evidenceKey,
          originalText: passage.originalText,
        });
        aliasMap.push([
          alias,
          passageAlias,
          source.evidenceKey,
          passage.passageId,
          passage.originalSha256,
          passage.startOffset,
          passage.endOffset,
          sha256(passage.originalText),
        ]);
        return { ...passage, passageId: passageAlias };
      }),
    }));
    const empty = evidence.length === 0;
    if (!empty && !passages.size) throw Error('INVALID_ASSESSMENT_PASSAGE');
    bindings.set(alias, { claim: packet.claim, empty, passages });
    branches.push(
      empty
        ? z
            .object({
              claimId: z.literal(alias),
              status: z.enum(['insufficient_context', 'not_applicable']),
            })
            .strict()
        : EvidenceSupportFindingSchema.omit({ claimId: true, citations: true })
            .extend({
              claimId: z.literal(alias),
              citations: z
                .array(
                  z
                    .object({ passageId: z.enum([...passages.keys()] as [string, ...string[]]) })
                    .strict(),
                )
                .max(12),
            })
            .strict(),
    );
    return { ...packet, claim: { ...packet.claim, id: alias }, evidence };
  });
  const findingSchema =
    branches.length === 1
      ? branches[0]!
      : z.union(branches as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  const schema = z.object({ assessments: z.array(findingSchema).length(claims.length) }).strict();
  const wireData = {
    ...owned,
    claims,
    assessmentProtocol: IMMUTABLE_PASSAGE_PROTOCOL,
    assessmentBindingSha256: sha256(canonical(aliasMap)),
  };
  if (Buffer.byteLength(JSON.stringify(wireData)) > 500_000)
    throw Error('ASSESSMENT_PACKET_TOO_LARGE');
  return {
    data: wireData,
    schema,
    resolve(raw: unknown) {
      const parsed = schema.parse(raw).assessments as WireFinding[];
      const seen = new Set<string>();
      const assessments = parsed.map((finding) => {
        const binding = bindings.get(finding.claimId);
        if (!binding || seen.has(finding.claimId)) throw Error('INVALID_ASSESSMENT_BINDING');
        seen.add(finding.claimId);
        if (binding.empty)
          return {
            claimId: binding.claim.id,
            status: finding.status,
            conditions: [],
            negations: [],
            exceptions: [],
            scope: [],
            citations: [],
            explanation: 'لم تتوفر أدلة أصلية مرتبطة بهذه العبارة.',
          };
        const selected = new Set<string>();
        const citations = finding.citations!.map((citation) => {
          const passage = binding.passages.get(citation.passageId);
          if (!passage || selected.has(citation.passageId))
            throw Error('INVALID_ASSESSMENT_BINDING');
          selected.add(citation.passageId);
          return { evidenceKey: passage.evidenceKey, excerpt: passage.originalText };
        });
        return { ...finding, claimId: binding.claim.id, citations };
      });
      // The unchanged public finding contract remains authoritative.
      return EvidenceSupportOutputSchema.parse({ assessments });
    },
  };
}
