import { z } from 'zod';

export const RewriteOperationsSchema = z
  .object({
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
    mode: z.literal('citation_and_layout_only'),
    scholarlyApproval: z.literal(false),
    storage: z.literal('session_bound_memory'),
  })
  .strict();
export type RewriteCandidate = z.infer<typeof RewriteCandidateSchema>;
