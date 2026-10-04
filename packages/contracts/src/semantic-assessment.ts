import { z } from 'zod';

export const SEMANTIC_PROMPT_VERSION = 'evidence-support-v1.4';
export const SEMANTIC_PIPELINE_VERSION = 'provisional-semantic-v1.4';

const EvidenceKeys = z.array(z.string().min(1).max(160)).max(20);
const Details = z.array(z.string().min(1).max(500)).max(6);

export const ExtractedClaimProposalSchema = z
  .object({
    segmentId: z.string().min(1).max(160),
    originalText: z.string().min(1).max(1500),
    evidenceKeys: EvidenceKeys,
  })
  .strict();
export const ClaimExtractionOutputSchema = z
  .object({
    claims: z.array(ExtractedClaimProposalSchema).max(5),
  })
  .strict();

export const SemanticClaimSchema = ExtractedClaimProposalSchema.extend({
  id: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  provisional: z.literal(true),
})
  .strict()
  .refine((claim) => claim.endOffset > claim.startOffset);
export type SemanticClaim = z.infer<typeof SemanticClaimSchema>;

export const EvidenceSupportFindingSchema = z
  .object({
    claimId: z.string().min(1).max(160),
    status: z.enum([
      'supported',
      'contradicted',
      'not_established',
      'insufficient_context',
      'not_applicable',
    ]),
    conditions: Details,
    negations: Details,
    exceptions: Details,
    scope: Details,
    citations: z
      .array(
        z
          .object({
            evidenceKey: z.string().min(1).max(160),
            excerpt: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .max(12),
    explanation: z
      .string()
      .min(1)
      .max(1500)
      .refine((text) => /\p{Script=Arabic}/u.test(text)),
  })
  .strict();
export type EvidenceSupportFinding = z.infer<typeof EvidenceSupportFindingSchema>;
export const EvidenceSupportOutputSchema = z
  .object({
    assessments: z.array(EvidenceSupportFindingSchema).max(5),
  })
  .strict();

export const SemanticErrorCodeSchema = z.enum([
  'configuration_missing',
  'configuration_invalid',
  'invalid_intake',
  'invalid_claims',
  'no_claims_extracted',
  'invalid_citations',
  'invalid_response',
  'body_too_large',
  'gateway_blocked',
  'rate_limited',
  'upstream_unavailable',
  'timeout',
  'deadline_exceeded',
  'cancelled',
]);
export type SemanticErrorCode = z.infer<typeof SemanticErrorCodeSchema>;

export const SemanticRequestTraceSchema = z
  .object({
    requestId: z.string().uuid(),
    stage: z.enum(['extraction', 'assessment']),
    modelId: z.string().min(1).max(160),
    providerId: z.string().min(1).max(120),
    fallback: z.boolean(),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    responseSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    responseId: z.string().max(200).nullable(),
    outcome: z.union([z.literal('success'), SemanticErrorCodeSchema]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    durationMs: z.number().nonnegative(),
    usage: z
      .object({
        promptTokens: z.number().int().nonnegative().nullable(),
        completionTokens: z.number().int().nonnegative().nullable(),
        totalTokens: z.number().int().nonnegative().nullable(),
        cost: z.number().finite().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SemanticRequestTrace = z.infer<typeof SemanticRequestTraceSchema>;

export const SemanticAssessmentReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(['disabled', 'not_applicable', 'completed', 'partial', 'unavailable']),
    claims: z.array(SemanticClaimSchema).max(5),
    assessments: z.array(EvidenceSupportFindingSchema).max(5),
    scholarlyApproval: z.literal(false),
    provisional: z.literal(true),
    errorCode: SemanticErrorCodeSchema.nullable(),
    trace: z
      .object({
        pipelineVersion: z.enum([
          'provisional-semantic-v1.1',
          'provisional-semantic-v1.2',
          'provisional-semantic-v1.3',
          SEMANTIC_PIPELINE_VERSION,
        ]),
        promptVersion: z.enum([
          'evidence-support-v1.1',
          'evidence-support-v1.2',
          'evidence-support-v1.3',
          SEMANTIC_PROMPT_VERSION,
        ]),
        inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        extractionInputSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .nullable(),
        assessmentInputSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .nullable(),
        requests: z.array(SemanticRequestTraceSchema).max(3),
      })
      .strict(),
    limitations: z.array(z.string().min(1).max(1000)).max(10),
  })
  .strict()
  .refine(
    (report) =>
      report.trace.pipelineVersion.slice('provisional-semantic-'.length) ===
      report.trace.promptVersion.slice('evidence-support-'.length),
    {
      message: 'Semantic prompt and pipeline versions must match',
    },
  );
export type SemanticAssessmentReport = z.infer<typeof SemanticAssessmentReportSchema>;
