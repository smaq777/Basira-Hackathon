import { z } from 'zod';

export const RewriteFailureReasonSchema = z.enum([
  'report_binding',
  'layout_schema',
  'candidate_schema',
  'claim_binding',
  'original_text_binding',
  'unchanged_wording',
  'unsafe_wording',
  'source_binding',
  'overlapping_replacements',
  'insertion_binding',
  'citation_binding',
  'protected_insertion',
  'insertion_inside_replacement',
  'candidate_length',
  'verifier_schema',
  'verifier_binding',
  'meaning_changed',
  'source_unsupported',
  'conditions_changed',
  'negations_changed',
  'exceptions_changed',
  'scope_changed',
  'modality_changed',
  'verifier_citation',
  'evidence_required',
  'stale_report',
  'provider_unavailable',
  'provider_output_invalid',
  'report_reload_unavailable',
  'deadline',
  'invalid_candidate',
]);
export type RewriteFailureReason = z.infer<typeof RewriteFailureReasonSchema>;
export const RewriteFailureReceiptSchema = z
  .object({
    event: z.literal('rewrite_failed'),
    stage: z.enum([
      'input',
      'generation',
      'report_reload',
      'candidate_validation',
      'verification',
      'verification_validation',
      'verified_report_reload',
      'deadline',
    ]),
    reason: RewriteFailureReasonSchema,
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    evidenceStateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    operationsSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    verificationSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();
export type RewriteFailureReceipt = z.infer<typeof RewriteFailureReceiptSchema>;

/** Explicitly opt in; only fixed codes and hashes may reach operational logs. */
export function rewriteDiagnosticSink(
  environment: NodeJS.ProcessEnv,
  write: (line: string) => void = (line) => console.warn(line),
) {
  if (environment.FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS !== 'true') return undefined;
  return (receipt: RewriteFailureReceipt) =>
    write(JSON.stringify(RewriteFailureReceiptSchema.parse(receipt)));
}
