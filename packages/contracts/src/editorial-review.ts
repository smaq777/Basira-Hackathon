import { z } from 'zod';
import type { FoundationReport } from './foundation.js';
import { SourceEvidenceSchema } from './foundation.js';

const text = (maximum: number) => z.string().max(maximum);
export const ReviewedEvidenceSchema = z
  .object({
    id: z.string().min(1).max(160),
    work: z.string().trim().min(1).max(300),
    reference: z.string().trim().min(1).max(500),
    edition: text(300),
    sourceUrl: z.union([
      z.literal(''),
      z
        .string()
        .url()
        .max(1000)
        .refine((url) => new URL(url).protocol === 'https:'),
    ]),
    originalText: z.string().trim().min(1).max(30000),
    context: text(5000),
    author: text(300).default(''),
    sourceRole: SourceEvidenceSchema.shape.sourceRole.default('book_excerpt'),
  })
  .strict();
export const ReviewedRecordSchema = z
  .object({
    id: z.string().min(1).max(160),
    kind: z.enum(['quotation', 'analysis', 'classification', 'context']),
    originalText: text(3000),
    status: z.enum([
      'unresolved',
      'matched',
      'different',
      'supported',
      'contradicted',
      'not_assessed',
      'removed',
    ]),
    correctedText: text(3000),
    explanation: text(5000),
    evidenceIds: z.array(z.string().min(1).max(160)).max(40),
  })
  .strict();
export const EditorialReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: text(5000),
    limitations: text(5000),
    suggestedText: text(12000),
    records: z.array(ReviewedRecordSchema).max(160),
    evidence: z.array(ReviewedEvidenceSchema).max(80),
  })
  .strict()
  .superRefine((review, ctx) => {
    const ids = new Set(review.evidence.map((source) => source.id));
    if (
      ids.size !== review.evidence.length ||
      new Set(review.records.map((row) => row.id)).size !== review.records.length
    )
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_REVIEW_RECORD' });
    for (const row of review.records) {
      if (row.evidenceIds.some((id) => !ids.has(id)))
        ctx.addIssue({ code: 'custom', message: 'MISSING_REVIEW_EVIDENCE' });
      if (
        ['matched', 'different', 'supported', 'contradicted'].includes(row.status) &&
        (!row.originalText.trim() || !row.evidenceIds.length || !row.explanation.trim())
      )
        ctx.addIssue({ code: 'custom', message: 'RESOLVED_RECORD_REQUIRES_EVIDENCE_AND_REASON' });
    }
    if (
      review.suggestedText.trim() &&
      !review.records.some(
        (row) =>
          ['matched', 'different', 'supported', 'contradicted'].includes(row.status) &&
          row.evidenceIds.length,
      )
    )
      ctx.addIssue({ code: 'custom', message: 'SUGGESTION_REQUIRES_EVIDENCE' });
  });
export type EditorialReview = z.infer<typeof EditorialReviewSchema>;
export type ReviewedRecord = z.infer<typeof ReviewedRecordSchema>;

export function initialEditorialReview(report: FoundationReport | null): EditorialReview {
  if (!report)
    return {
      schemaVersion: 1,
      summary: '',
      limitations: '',
      suggestedText: '',
      records: [],
      evidence: [],
    };
  const records: ReviewedRecord[] = report.intake.quotationFindings.map((finding) => ({
    id: `quotation:${finding.segmentId}`,
    kind: 'quotation',
    originalText:
      report.intake.segments.find((row) => row.id === finding.segmentId)?.originalText ?? '',
    status:
      finding.status === 'unresolved'
        ? 'unresolved'
        : finding.status === 'mismatch'
          ? 'different'
          : 'matched',
    correctedText: '',
    explanation: finding.reason,
    evidenceIds: finding.evidenceKey ? [finding.evidenceKey] : [],
  }));
  for (const claim of report.semanticAssessment?.claims ?? []) {
    const finding = report.semanticAssessment?.assessments.find((row) => row.claimId === claim.id);
    records.push({
      id: `analysis:${claim.id}`,
      kind: 'analysis',
      originalText: claim.originalText,
      status:
        finding?.status === 'supported'
          ? 'supported'
          : finding?.status === 'contradicted'
            ? 'contradicted'
            : 'unresolved',
      correctedText: '',
      explanation: finding
        ? [
            finding.explanation,
            ...finding.conditions,
            ...finding.negations,
            ...finding.exceptions,
            ...finding.scope,
          ].join('\n')
        : '',
      evidenceIds: claim.evidenceKeys,
    });
  }
  for (const segment of report.intake.segments)
    records.push({
      id: `classification:${segment.id}`,
      kind: 'classification',
      originalText: segment.originalText,
      status: 'not_assessed',
      correctedText: segment.role,
      explanation: segment.method,
      evidenceIds: segment.sourceKeys,
    });
  for (const card of report.improvementCards)
    records.push({
      id: `context:${card.id}`,
      kind: 'context',
      originalText: card.trigger.originalText,
      status: 'not_assessed',
      correctedText: card.suggestedDraft ?? '',
      explanation: [card.title, card.explanation, card.limitation].join('\n'),
      evidenceIds: card.evidenceKeys,
    });
  return {
    schemaVersion: 1,
    summary: report.interpretation.explanation,
    limitations: report.limitations.join('\n'),
    suggestedText: '',
    records,
    evidence: report.intake.evidence.map((source) => ({
      id: source.snapshotKey,
      work: source.work,
      reference: source.reference,
      edition: source.edition ?? '',
      sourceUrl: source.sourceUrl?.startsWith('https:') ? source.sourceUrl : '',
      originalText: source.originalText,
      context: [source.contextBefore, source.contextAfter].filter(Boolean).join('\n'),
      author: source.author ?? '',
      sourceRole: source.sourceRole,
    })),
  };
}
