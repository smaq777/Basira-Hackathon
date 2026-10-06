import { z } from 'zod';
import { SourceContentSelectionSchema } from './source-content.js';
const CacheChunkerVersion = z.enum(['cache-sentence-context-v1', 'exact-content-block-context-v1']);

export const SEMANTIC_PROMPT_VERSION = 'evidence-support-v1.11';
export const SEMANTIC_PIPELINE_VERSION = 'provisional-semantic-v1.11';

const EvidenceKeys = z.array(z.string().min(1).max(160)).max(20);
const Details = z.array(z.string().min(1).max(500)).max(6);

const CacheStage = z.enum(['disabled', 'success', 'timeout', 'unavailable', 'invalid']);
export const CacheSearchDiagnosticsSchema = z
  .object({
    outcome: z.enum(['success', 'partial', 'timeout', 'unavailable']),
    elapsedMs: z.number().int().nonnegative().max(240000),
    budgetMs: z.number().int().positive().max(30000).optional(),
    parentCandidateCount: z.number().int().nonnegative().max(8),
    selectedParentCount: z.number().int().nonnegative().max(2).optional(),
    deduplicatedParentCount: z.number().int().nonnegative().max(8).optional(),
    stages: z
      .object({
        embedding: CacheStage,
        pages: CacheStage,
        passages: CacheStage,
        content: CacheStage,
      })
      .strict()
      .optional(),
    failureCodes: z
      .array(
        z.enum([
          'cache_timeout',
          'cache_unavailable',
          'embedding_timeout',
          'embedding_unavailable',
          'embedding_invalid',
          'pages_unavailable',
          'passages_unavailable',
          'content_unavailable',
        ]),
      )
      .max(8),
  })
  .strict()
  .refine(
    (value) => value.outcome !== 'success' || value.failureCodes.length === 0,
    'Successful cache retrieval cannot include failure codes',
  )
  .refine(
    (value) => (value.selectedParentCount ?? 0) <= value.parentCandidateCount,
    'Selected cache parents must be candidates',
  );
export type CacheSearchDiagnostics = z.infer<typeof CacheSearchDiagnosticsSchema>;
export const CacheRestoreDiagnosticsSchema = z
  .object({
    outcome: z.enum(['success', 'timeout', 'unavailable']),
    elapsedMs: z.number().int().nonnegative().max(240000),
    budgetMs: z.number().int().positive().max(30000),
    restoredParentCount: z.number().int().nonnegative().max(100),
    failureCodes: z.array(z.enum(['cache_timeout', 'cache_unavailable'])).max(2),
  })
  .strict();
export type CacheRestoreDiagnostics = z.infer<typeof CacheRestoreDiagnosticsSchema>;

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

/** v1.9 wire aliases are translated only through the request-owned canonical map. */
export const AliasedClaimSelectionOutputSchema = z
  .object({
    claims: z
      .array(
        z
          .object({
            candidateId: z.string().regex(/^C[1-9][0-9]{0,3}$/u),
            evidenceKeys: z.array(z.string().regex(/^E[1-9][0-9]{0,3}$/u)).max(20),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export const SelectionBindingDiagnosticsSchema = z
  .object({
    protocol: z.literal('exact-selection-alias-v1'),
    attempt: z.enum(['initial', 'empty_reconsideration']),
    aliasMapSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    proposalCount: z.number().int().nonnegative().max(5),
    acceptedCount: z.number().int().nonnegative().max(5),
    rejectedCount: z.number().int().nonnegative().max(5),
    rejectionCounts: z
      .object({
        unknown_candidate_alias: z.number().int().nonnegative().max(5),
        unknown_evidence_alias: z.number().int().nonnegative().max(5),
        duplicate_candidate_alias: z.number().int().nonnegative().max(5),
        duplicate_evidence_alias: z.number().int().nonnegative().max(5),
      })
      .strict(),
  })
  .strict()
  .refine(
    (row) => row.acceptedCount + row.rejectedCount === row.proposalCount,
    'Selection counts must cover all proposals',
  );
export type SelectionBindingDiagnostics = z.infer<typeof SelectionBindingDiagnosticsSchema>;

/** v1.7 selects server-owned spans; the legacy proposal schema remains readable. */
export const ClaimSelectionOutputSchema = z
  .object({
    claims: z
      .array(
        z
          .object({
            candidateId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
            evidenceKeys: EvidenceKeys,
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

const EvidencePassageFieldsSchema = z
  .object({
    passageId: z.string().regex(/^passage-[a-f0-9]{24}$/u),
    evidenceKey: z.string().min(1).max(160),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    offsetUnit: z.literal('utf16_code_unit'),
    originalText: z.string().min(1).max(4000),
    contextTruncated: z.boolean(),
    boundaryTruncated: z.boolean(),
    relevance: z.number().nonnegative(),
  })
  .strict();
export const EvidencePassageViewSchema = EvidencePassageFieldsSchema.refine(
  (row) => row.endOffset - row.startOffset === row.originalText.length,
);
export type EvidencePassageView = z.infer<typeof EvidencePassageViewSchema>;
export const CachePassagePreferenceSchema = z
  .object({
    claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
    evidenceKey: z.string().min(1).max(160),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    querySha256: z.string().regex(/^[a-f0-9]{64}$/u),
    chunkerVersion: CacheChunkerVersion,
    contentSelection: SourceContentSelectionSchema.optional(),
    hits: z
      .array(
        z
          .object({
            passageId: z.string().regex(/^cache-passage:[a-f0-9]{48}$/u),
            originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            passageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            chunkerVersion: CacheChunkerVersion,
            startOffset: z.number().int().nonnegative(),
            endOffset: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    coverage: z
      .object({
        chunkerVersion: CacheChunkerVersion,
        passageCount: z.number().int().positive().max(32),
        coveredUtf16Units: z.number().int().positive().max(30000),
        totalUtf16Units: z.number().int().positive().max(30000),
        fullTextIndexed: z.boolean(),
        boundaryTruncatedCount: z.number().int().nonnegative().max(32),
      })
      .strict(),
  })
  .strict();
export type CachePassagePreference = z.infer<typeof CachePassagePreferenceSchema>;

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
    stage: z.enum(['extraction', 'relevance', 'assessment', 'gap_assessment']),
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
          'provisional-semantic-v1.4',
          'provisional-semantic-v1.5',
          'provisional-semantic-v1.6',
          'provisional-semantic-v1.7',
          'provisional-semantic-v1.8',
          'provisional-semantic-v1.9',
          'provisional-semantic-v1.10',
          SEMANTIC_PIPELINE_VERSION,
        ]),
        promptVersion: z.enum([
          'evidence-support-v1.1',
          'evidence-support-v1.2',
          'evidence-support-v1.3',
          'evidence-support-v1.4',
          'evidence-support-v1.5',
          'evidence-support-v1.6',
          'evidence-support-v1.7',
          'evidence-support-v1.8',
          'evidence-support-v1.9',
          'evidence-support-v1.10',
          SEMANTIC_PROMPT_VERSION,
        ]),
        inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        claimCoverage: z
          .object({
            inventoryVersion: z.literal('original-span-v1'),
            candidates: z
              .array(
                z
                  .object({
                    candidateId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
                    segmentId: z.string().min(1).max(160),
                    startOffset: z.number().int().nonnegative(),
                    endOffset: z.number().int().positive(),
                  })
                  .strict(),
              )
              .max(1500),
            excluded: z
              .array(
                z
                  .object({
                    startOffset: z.number().int().nonnegative(),
                    endOffset: z.number().int().positive(),
                    reason: z.enum(['question', 'quotation', 'framing', 'span_too_long']),
                  })
                  .strict(),
              )
              .max(3000),
            selectedIds: z.array(z.string().regex(/^claim-[a-f0-9]{24}$/u)).max(5),
            unselectedIds: z.array(z.string().regex(/^claim-[a-f0-9]{24}$/u)).max(1500),
            claimLimitReached: z.boolean(),
          })
          .strict()
          .optional(),
        passageViews: z
          .array(
            z
              .object({
                claimId: z.string().min(1).max(160),
                passages: z
                  .array(
                    EvidencePassageFieldsSchema.omit({ originalText: true }).extend({
                      excerptSha256: z.string().regex(/^[a-f0-9]{64}$/u),
                    }),
                  )
                  .max(60),
              })
              .strict(),
          )
          .max(6)
          .optional(),
        evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        extractionInputSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .nullable(),
        selectionBinding: z.array(SelectionBindingDiagnosticsSchema).max(2).optional(),
        selectionRecovery: z
          .object({
            outcome: z.enum(['recovered', 'still_empty', 'budget_skipped', 'failed']),
            candidateCount: z.number().int().positive().max(1500),
          })
          .strict()
          .optional(),
        retrievalBudget: z
          .object({
            outcome: z.enum(['completed', 'budget_skipped', 'timeout', 'unavailable']),
            configuredMs: z.number().int().positive().max(90000),
            appliedMs: z.number().int().nonnegative().max(90000),
            assessmentReserveMs: z.number().int().nonnegative().max(90000),
            elapsedMs: z.number().int().nonnegative().max(240000),
          })
          .strict()
          .optional(),
        assessmentInputSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .nullable(),
        extractionEvidenceSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .optional(),
        finalEvidenceSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .optional(),
        retrieval: z
          .object({
            corpusVersion: z.string().min(1).max(120),
            mode: z.enum(['approved', 'local_research']),
            passagePreferences: z.array(CachePassagePreferenceSchema).max(40).optional(),
            cacheRestore: CacheRestoreDiagnosticsSchema.optional(),
            queries: z
              .array(
                z
                  .object({
                    claimId: z.string().min(1).max(160),
                    querySha256: z.string().regex(/^[a-f0-9]{64}$/u),
                    modes: z.array(z.enum(['exact', 'lexical', 'semantic'])).max(3),
                    candidateKeys: z.array(z.string().min(1).max(160)).max(12),
                    selectedCandidateKeys: EvidenceKeys.optional(),
                    cache: CacheSearchDiagnosticsSchema.optional(),
                  })
                  .strict()
                  .refine(
                    (value) =>
                      !value.selectedCandidateKeys ||
                      value.selectedCandidateKeys.every((key) => value.candidateKeys.includes(key)),
                    'Selected keys must be query candidates',
                  ),
              )
              .max(15),
          })
          .strict()
          .optional(),
        initialAssessmentInputSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .optional(),
        discovery: z
          .object({
            claimId: z.string().min(1).max(160),
            reason: z.enum(['not_established', 'insufficient_context']),
            querySha256: z.string().regex(/^[a-f0-9]{64}$/u),
            outcome: z.enum([
              'budget_skipped',
              'packet_budget_skipped',
              'no_evidence',
              'failed',
              'reassessed',
              'reassessment_failed',
            ]),
            addedKeys: z.array(z.string().min(1).max(160)).max(2),
            failureCodes: z.array(z.string().regex(/^[a-z_0-9]{1,100}$/u)).max(10),
          })
          .strict()
          .optional(),
        requests: z.array(SemanticRequestTraceSchema).max(9),
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
