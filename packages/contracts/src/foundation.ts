import { z } from 'zod';
import { ImprovementCardSchema, ThemeAnalysisSchema } from './themes.js';
import { SemanticAssessmentReportSchema } from './semantic-assessment.js';

export const SourceEvidenceSchema = z
  .object({
    snapshotKey: z.string().min(1).max(160),
    sourceId: z.string().min(1).max(160),
    sourceVersion: z.string().min(1).max(120),
    sourceRole: z.enum([
      'quran_text',
      'hadith_matn',
      'tafsir_commentary',
      'tafsir_footnote',
      'book_excerpt',
      'scholar_explanation',
      'reviewer_commentary',
    ]),
    reference: z.string().min(1).max(500),
    originalText: z.string().min(1).max(30000),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    work: z.string().min(1).max(300),
    author: z.string().max(300).nullable(),
    edition: z.string().max(300).nullable(),
    sourceUrl: z.string().url().max(1000).nullable(),
    approvalStatus: z.enum(['pending', 'approved', 'rejected', 'revoked']),
    researchOnly: z.boolean(),
    parentSnapshotKey: z.string().max(160).nullable(),
    delivery: z.enum(['live', 'snapshot']),
    retrievalModes: z
      .array(z.enum(['exact', 'lexical', 'semantic']))
      .min(1)
      .max(3),
    provenance: z.record(z.string(), z.unknown()),
    contextBefore: z.string().max(30000).nullable().optional(),
    contextAfter: z.string().max(30000).nullable().optional(),
    footnotes: z
      .array(
        z
          .object({
            reference: z.string().min(1).max(500),
            originalText: z.string().min(1).max(30000),
            originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          })
          .strict(),
      )
      .max(80)
      .optional(),
    relations: z
      .array(
        z
          .object({
            targetSnapshotKey: z.string().min(1).max(160),
            relationType: z.enum([
              'explains',
              'comments_on',
              'quotes',
              'context_before',
              'context_after',
              'footnote_of',
            ]),
            provenance: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(80)
      .optional(),
  })
  .strict();
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;

export const IntakeSegmentSchema = z
  .object({
    id: z.string().min(1).max(160),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    codePointStart: z.number().int().nonnegative(),
    codePointEnd: z.number().int().positive(),
    originalText: z.string().min(1).max(3000),
    role: z.enum(['ayah', 'matn', 'isnad', 'claimed_source', 'author_text', 'unclassified']),
    roleStatus: z.enum(['source_matched', 'candidate', 'unresolved']),
    method: z.string().min(1).max(160),
    sourceKeys: z.array(z.string().min(1).max(160)).max(80),
    roleProposal: z.enum(['ayah', 'matn', 'isnad', 'claimed_source', 'other']).nullable(),
    conflict: z.boolean(),
  })
  .strict()
  .refine((row) => row.endOffset > row.startOffset && row.codePointEnd > row.codePointStart);
export type IntakeSegment = z.infer<typeof IntakeSegmentSchema>;

export const QuotationComparisonSchema = z
  .object({
    fidelity: z.enum(['exact', 'orthographic', 'different', 'unresolved']),
    extent: z.enum(['full', 'excerpt', 'gapped', 'unknown']),
    differences: z
      .array(
        z
          .object({
            kind: z.enum(['replace', 'omit', 'insert']),
            quotedText: z.string().max(3000),
            sourceText: z.string().max(30000),
          })
          .strict(),
      )
      .max(80),
    basis: z.enum(['canonical', 'auxiliary_imlai', 'typography', 'none']),
  })
  .strict();
export type QuotationComparison = z.infer<typeof QuotationComparisonSchema>;

export const ClaimApplicabilitySchema = z
  .object({
    status: z.enum(['applicable', 'not_applicable', 'undetermined']),
    reason: z.enum([
      'question_and_quotations_only',
      'quotation_only',
      'assertion_present',
      'unclear_author_text',
    ]),
  })
  .strict();
export type ClaimApplicability = z.infer<typeof ClaimApplicabilitySchema>;

export const LiteralFindingSchema = z
  .object({
    segmentId: z.string().min(1),
    evidenceKey: z.string().min(1).nullable(),
    status: z.enum(['exact', 'normalized', 'partial', 'mismatch', 'unresolved']),
    reason: z.string().min(1).max(1000),
    matchedStart: z.number().int().nonnegative().nullable(),
    matchedEnd: z.number().int().nonnegative().nullable(),
    comparison: QuotationComparisonSchema.optional(),
  })
  .strict();
export type LiteralFinding = z.infer<typeof LiteralFindingSchema>;

export const FoundationIntakeSchema = z
  .object({
    schemaVersion: z.literal(1),
    pipelineVersion: z.string().min(1).max(120),
    revisionId: z.string().uuid(),
    revisionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    corpusVersion: z.string().min(1).max(120),
    originalText: z.string().min(1).max(3000),
    offsetUnit: z.literal('utf16_code_unit'),
    segments: z.array(IntakeSegmentSchema).max(80),
    evidence: z.array(SourceEvidenceSchema).max(80),
    quotationFindings: z.array(LiteralFindingSchema).max(80),
    contextCoverage: z
      .array(
        z
          .object({
            reference: z.string().max(500),
            requestedWorks: z.array(z.string().max(300)).max(10),
            availableWorks: z.array(z.string().max(300)).max(10),
            status: z.enum(['complete_transport', 'partial', 'unavailable']),
            scholarlyContextComplete: z.literal(false),
          })
          .strict(),
      )
      .max(30),
    warnings: z.array(z.string().max(1000)).max(40),
    researchOnly: z.boolean(),
  })
  .strict();
export type FoundationIntake = z.infer<typeof FoundationIntakeSchema>;

export const FoundationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewId: z.string().uuid(),
    revisionId: z.string().uuid(),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    evidenceStateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    pipelineVersion: z.string().min(1),
    generatedAt: z.iso.datetime(),
    status: z.enum(['completed', 'partial', 'needs_review']),
    intake: FoundationIntakeSchema,
    themes: ThemeAnalysisSchema,
    improvementCards: z.array(ImprovementCardSchema).max(3),
    semanticAssessment: SemanticAssessmentReportSchema.optional(),
    interpretation: z
      .object({
        status: z.enum([
          'needs_confirmation',
          'not_assessed',
          'unavailable',
          'not_applicable',
          'provisional',
        ]),
        applicability: ClaimApplicabilitySchema.optional(),
        explanation: z.string().min(1),
        scholarlyApproval: z.literal(false),
      })
      .strict(),
    limitations: z.array(z.string()).max(30),
  })
  .strict()
  .superRefine((report, context) => {
    const semantic = report.semanticAssessment;
    if (!semantic) return;
    const invalid = () =>
      context.addIssue({ code: 'custom', message: 'Semantic report binding mismatch' });
    if (semantic.trace.inputSha256 !== report.inputSha256) invalid();
    const ids = new Set<string>();
    for (const claim of semantic.claims) {
      const segment = report.intake.segments.find((row) => row.id === claim.segmentId);
      if (
        ids.has(claim.id) ||
        !segment ||
        segment.role !== 'author_text' ||
        claim.startOffset < segment.startOffset ||
        claim.endOffset > segment.endOffset ||
        report.intake.originalText.slice(claim.startOffset, claim.endOffset) !==
          claim.originalText ||
        claim.evidenceKeys.some(
          (key) => !report.intake.evidence.some((row) => row.snapshotKey === key),
        )
      )
        invalid();
      ids.add(claim.id);
    }
    const assessed = new Set<string>();
    const sources = new Map(report.intake.evidence.map((source) => [source.snapshotKey, source]));
    const sourceRoot = (key: string): string | undefined => {
      const visited = new Set<string>();
      while (!visited.has(key)) {
        visited.add(key);
        const source = sources.get(key);
        if (!source) return undefined;
        if (!source.parentSnapshotKey) return key;
        key = source.parentSnapshotKey;
      }
      return undefined;
    };
    for (const finding of semantic.assessments) {
      const claim = semantic.claims.find((row) => row.id === finding.claimId);
      const allowedRoots = new Set(claim?.evidenceKeys.map(sourceRoot).filter(Boolean));
      if (
        !ids.has(finding.claimId) ||
        assessed.has(finding.claimId) ||
        (['supported', 'contradicted'].includes(finding.status) && !finding.citations.length)
      )
        invalid();
      assessed.add(finding.claimId);
      for (const citation of finding.citations) {
        const source = report.intake.evidence.find(
          (row) => row.snapshotKey === citation.evidenceKey,
        );
        if (
          !source ||
          !allowedRoots.has(sourceRoot(citation.evidenceKey)) ||
          !source.originalText.includes(citation.excerpt)
        )
          invalid();
      }
      if (
        !allowedRoots.size &&
        !['insufficient_context', 'not_applicable'].includes(finding.status)
      )
        invalid();
    }
    if (semantic.status === 'completed' && (!ids.size || assessed.size !== ids.size)) invalid();
    if (
      ['disabled', 'unavailable', 'not_applicable'].includes(semantic.status) &&
      semantic.assessments.length
    )
      invalid();
  });
export type FoundationReport = z.infer<typeof FoundationReportSchema>;
