import { z } from 'zod';
import type { FoundationReport } from './foundation.js';
import { assessClaimApplicability } from './claim-applicability.js';

/** Complete evidence is required before offering a reusable suggested draft. */
export function rewriteEvidenceReady(report: FoundationReport): boolean {
  const semantic = report.semanticAssessment;
  const quotationOnly =
    report.interpretation.status === 'not_applicable' &&
    assessClaimApplicability(report.intake).reason === 'quotation_only';
  if (
    (!semantic && !quotationOnly) ||
    (semantic &&
      (!['completed', 'not_applicable'].includes(semantic.status) ||
        semantic.trace.inputSha256 !== report.inputSha256 ||
        (semantic.claims.length > 0 &&
          (semantic.status !== 'completed' || !semantic.trace.claimCoverage)) ||
        (semantic.claims.length === 0 &&
          (semantic.status !== 'not_applicable' || !quotationOnly)) ||
        semantic.trace.claimCoverage?.unselectedIds.length ||
        semantic.trace.claimCoverage?.excluded.some((span) => span.reason === 'span_too_long'))) ||
    report.intake.segments.some((span) => span.conflict || span.role === 'unclassified')
  )
    return false;
  if (
    report.intake.segments.some(
      (segment) =>
        ['ayah', 'matn'].includes(segment.role) &&
        !report.intake.quotationFindings.some((finding) => finding.segmentId === segment.id),
    )
  )
    return false;
  const source = (key: string) =>
    report.intake.evidence.find(
      (item) => item.snapshotKey === key && !['rejected', 'revoked'].includes(item.approvalStatus),
    );
  if (
    report.intake.quotationFindings.some(
      (finding) =>
        !finding.evidenceKey ||
        !source(finding.evidenceKey) ||
        !(
          ['exact', 'normalized'].includes(finding.status) ||
          (finding.status === 'partial' &&
            ['exact', 'orthographic'].includes(finding.comparison?.fidelity ?? ''))
        ) ||
        (finding.comparison && !['exact', 'orthographic'].includes(finding.comparison.fidelity)),
    )
  )
    return false;
  let evidenceCount = report.intake.quotationFindings.length;
  for (const claim of semantic?.claims ?? []) {
    const assessment = semantic!.assessments.find((item) => item.claimId === claim.id);
    if (
      !assessment ||
      assessment.status !== 'supported' ||
      !assessment.citations.length ||
      assessment.citations.some(
        (citation) => !source(citation.evidenceKey)?.originalText.includes(citation.excerpt),
      )
    )
      return false;
    evidenceCount += assessment.citations.length;
  }
  return evidenceCount > 0;
}

export const AuthorReplacementSchema = z
  .object({
    claimId: z.string().min(1).max(160),
    originalText: z.string().min(1).max(1500),
    replacementText: z.string().min(1).max(1500),
    evidenceKeys: z.array(z.string().min(1).max(160)).min(1).max(20),
  })
  .strict();

export const RewriteOperationsSchema = z
  .object({
    replacements: z.array(AuthorReplacementSchema).max(5).optional(),
    paragraphBreaks: z.array(z.number().int().positive().max(3000)).max(8),
    citations: z
      .array(
        z
          .object({
            offset: z.number().int().positive().max(3000),
            evidenceKey: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type RewriteOperations = z.infer<typeof RewriteOperationsSchema>;

export const SubstantiveRewriteOperationsSchema = RewriteOperationsSchema.extend({
  replacements: z.array(AuthorReplacementSchema).max(5),
});
export const RewriteVerificationSchema = z
  .object({
    schemaVersion: z.literal(2),
    checks: z
      .array(
        z
          .object({
            claimId: z.string().min(1).max(160),
            meaningPreserved: z.boolean(),
            evidenceSupported: z.boolean(),
            conditionsPreserved: z.boolean(),
            negationsPreserved: z.boolean(),
            exceptionsPreserved: z.boolean(),
            scopePreserved: z.boolean(),
            modalityPreserved: z.boolean(),
            citations: z
              .array(
                z
                  .object({
                    evidenceKey: z.string().min(1).max(160),
                    excerpt: z.string().min(1).max(4000),
                  })
                  .strict(),
              )
              .min(1)
              .max(12),
            explanation: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

export const RewriteCandidateSchema = z
  .object({
    id: z.uuid(),
    reviewId: z.uuid(),
    revisionId: z.uuid(),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    evidenceStateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.enum(['pending', 'validated', 'failed', 'cancelled']),
    text: z.string().max(3000).nullable(),
    operations: RewriteOperationsSchema.nullable(),
    unresolved: z.array(z.string().max(500)).max(85),
    errorCode: z
      .enum(['invalid_candidate', 'provider_unavailable', 'stale_report', 'cancelled'])
      .nullable(),
    expiresAt: z.iso.datetime(),
    mode: z.enum(['citation_and_layout_only', 'supported_author_wording']),
    scholarlyApproval: z.literal(false),
    storage: z.literal('session_bound_memory'),
  })
  .strict();
export type RewriteCandidate = z.infer<typeof RewriteCandidateSchema>;
