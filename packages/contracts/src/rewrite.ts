import { z } from 'zod';

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
