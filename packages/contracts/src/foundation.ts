import { z } from 'zod';
import { ImprovementCardSchema, ThemeAnalysisSchema } from './themes.js';

export const SourceEvidenceSchema = z
  .object({
    snapshotKey: z.string().min(1).max(160),
    sourceId: z.string().min(1).max(160),
    sourceVersion: z.string().min(1).max(120),
    sourceRole: z.enum(['quran_text', 'hadith_matn', 'tafsir_commentary', 'tafsir_footnote']),
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

export const LiteralFindingSchema = z
  .object({
    segmentId: z.string().min(1),
    evidenceKey: z.string().min(1).nullable(),
    status: z.enum(['exact', 'normalized', 'partial', 'mismatch', 'unresolved']),
    reason: z.string().min(1).max(1000),
    matchedStart: z.number().int().nonnegative().nullable(),
    matchedEnd: z.number().int().nonnegative().nullable(),
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
    interpretation: z
      .object({
        status: z.enum(['needs_confirmation', 'not_assessed', 'unavailable']),
        explanation: z.string().min(1),
        scholarlyApproval: z.literal(false),
      })
      .strict(),
    limitations: z.array(z.string()).max(30),
  })
  .strict();
export type FoundationReport = z.infer<typeof FoundationReportSchema>;
