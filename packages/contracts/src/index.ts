import { z } from 'zod';
export const EvidenceSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    sourceVersion: z.string().min(1),
    reference: z.string().min(1),
    originalText: z.string().min(1),
    retrievedAt: z.iso.datetime(),
    delivery: z.enum(['live', 'snapshot']),
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
export const FindingSchema = z
  .object({
    claimId: z.string().min(1),
    revisionId: z.string().min(1),
    quoteStatus: z.enum(['exact', 'normalized', 'mismatch', 'not_applicable', 'unresolved']),
    supportStatus: z.enum([
      'supported',
      'overgeneralization',
      'missing_qualification',
      'unsupported_exclusivity',
      'insufficient_evidence',
      'out_of_scope',
    ]),
    evidenceIds: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;

export const QuoteComparisonSchema = z
  .object({
    overallStatus: z.enum(['exact', 'normalized', 'mismatch', 'unresolved']),
    quoteStatus: z.enum(['exact', 'normalized', 'mismatch', 'unresolved']),
    attributionStatus: z.enum(['exact', 'mismatch', 'missing']),
    sourceOriginalText: z.string().min(1),
    sourceReference: z.string().min(1),
    reason: z.enum([
      'exact_text_and_reference',
      'limited_formatting_difference',
      'quotation_mismatch',
      'attribution_mismatch',
      'attribution_missing',
      'ellipsis_requires_review',
    ]),
  })
  .strict();
export type QuoteComparison = z.infer<typeof QuoteComparisonSchema>;

export const ClaimCandidateSchema = z
  .object({
    id: z.string().regex(/^candidate-[1-5]$/u),
    text: z.string().min(1).max(4000),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    claimType: z.enum([
      'quotation',
      'attribution',
      'interpretation',
      'generalization',
      'exclusivity',
      'other',
    ]),
    quotation: z.string().min(1).max(4000).nullable(),
    reference: z.string().min(1).max(120).nullable(),
  })
  .strict()
  .refine((candidate) => candidate.endOffset > candidate.startOffset, {
    message: 'Candidate offsets must be ordered',
  });
export type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;

export const ClaimExtractionSchema = z
  .object({
    candidates: z.array(ClaimCandidateSchema).max(5),
    warnings: z.array(
      z.enum(['unbalanced_quotation_marks', 'candidate_limit_reached', 'no_claims_detected']),
    ),
    offsetUnit: z.literal('utf16_code_unit'),
  })
  .strict();
export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;

function claimType(text: string, quotation: string | null): ClaimCandidate['claimType'] {
  if (quotation) return 'quotation';
  if (/(?:فقط|وحده|حصراً)|لا\s+[^.،؛؟!\n]{1,80}\s+إلا/iu.test(text)) return 'exclusivity';
  if (/(?:كل|دائم[ًاا]?|جميع|يجب|لا يجوز|الأفضل)/u.test(text)) return 'generalization';
  if (/(?:قال تعالى|قال رسول|رواه|ورد في)/u.test(text)) return 'attribution';
  if (/(?:يدل|يعني|المقصود|يُفهم|يفهم)/u.test(text)) return 'interpretation';
  return 'other';
}

function firstQuotation(text: string): string | null {
  const match = /«([^»]{1,4000})»|“([^”]{1,4000})”|"([^"\n]{1,4000})"/u.exec(text);
  return match?.[1]?.trim() || match?.[2]?.trim() || match?.[3]?.trim() || null;
}

function firstReference(text: string): string | null {
  return /\[([^\]\n]{1,120})\]/u.exec(text)?.[1]?.trim() || null;
}

// Candidate discovery only. User text is data; no content inside it is executed as instructions.
export function extractClaimCandidates(input: unknown): ClaimExtraction {
  const text = z.string().min(1).max(3000).parse(input);
  const warnings: ClaimExtraction['warnings'] = [];
  const unbalancedQuotationMarks =
    (text.match(/«/gu) ?? []).length !== (text.match(/»/gu) ?? []).length ||
    (text.match(/“/gu) ?? []).length !== (text.match(/”/gu) ?? []).length ||
    (text.match(/"/gu) ?? []).length % 2 !== 0;
  if (unbalancedQuotationMarks) warnings.push('unbalanced_quotation_marks');

  const segments = [...text.matchAll(/[^.!؟\n]+[.!؟]?/gu)]
    .map((match) => {
      const raw = match[0];
      const leading = raw.length - raw.trimStart().length;
      const trailing = raw.length - raw.trimEnd().length;
      const startOffset = (match.index ?? 0) + leading;
      const endOffset = (match.index ?? 0) + raw.length - trailing;
      return { text: text.slice(startOffset, endOffset), startOffset, endOffset };
    })
    .filter((segment) => segment.text.length > 1);

  if (segments.length > 5) warnings.push('candidate_limit_reached');
  const candidates = segments.slice(0, 5).map((segment, index) => {
    const quotation = firstQuotation(segment.text);
    return ClaimCandidateSchema.parse({
      id: `candidate-${index + 1}`,
      ...segment,
      claimType: claimType(segment.text, quotation),
      quotation,
      reference: firstReference(segment.text),
    });
  });
  if (candidates.length === 0) warnings.push('no_claims_detected');
  return ClaimExtractionSchema.parse({ candidates, warnings, offsetUnit: 'utf16_code_unit' });
}

function limitedQuoteKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function referenceKey(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

// Deterministic formatting comparison only. It does not establish authenticity or support.
export function compareQuotation(input: {
  quotedText: string;
  claimedReference?: string | null;
  evidence: Evidence;
}): QuoteComparison {
  const evidence = EvidenceSchema.parse(input.evidence);
  const quotedText = z.string().trim().min(1).max(30_000).parse(input.quotedText);
  const claimedReference = input.claimedReference?.trim() || null;
  const attributionStatus = !claimedReference
    ? 'missing'
    : referenceKey(claimedReference) === referenceKey(evidence.reference)
      ? 'exact'
      : 'mismatch';

  let quoteStatus: QuoteComparison['quoteStatus'];
  if (quotedText === evidence.originalText) quoteStatus = 'exact';
  else if (/…|\.\s*\.\s*\./u.test(quotedText)) quoteStatus = 'unresolved';
  else if (limitedQuoteKey(quotedText) === limitedQuoteKey(evidence.originalText))
    quoteStatus = 'normalized';
  else quoteStatus = 'mismatch';

  if (attributionStatus === 'mismatch')
    return QuoteComparisonSchema.parse({
      overallStatus: 'mismatch',
      quoteStatus,
      attributionStatus,
      sourceOriginalText: evidence.originalText,
      sourceReference: evidence.reference,
      reason: 'attribution_mismatch',
    });
  if (attributionStatus === 'missing')
    return QuoteComparisonSchema.parse({
      overallStatus: 'unresolved',
      quoteStatus,
      attributionStatus,
      sourceOriginalText: evidence.originalText,
      sourceReference: evidence.reference,
      reason: 'attribution_missing',
    });
  if (quoteStatus === 'unresolved')
    return QuoteComparisonSchema.parse({
      overallStatus: 'unresolved',
      quoteStatus,
      attributionStatus,
      sourceOriginalText: evidence.originalText,
      sourceReference: evidence.reference,
      reason: 'ellipsis_requires_review',
    });
  if (quoteStatus === 'mismatch')
    return QuoteComparisonSchema.parse({
      overallStatus: 'mismatch',
      quoteStatus,
      attributionStatus,
      sourceOriginalText: evidence.originalText,
      sourceReference: evidence.reference,
      reason: 'quotation_mismatch',
    });
  return QuoteComparisonSchema.parse({
    overallStatus: quoteStatus,
    quoteStatus,
    attributionStatus,
    sourceOriginalText: evidence.originalText,
    sourceReference: evidence.reference,
    reason: quoteStatus === 'exact' ? 'exact_text_and_reference' : 'limited_formatting_difference',
  });
}

// Identifier/scope guard only. This does not verify religious reasoning or authenticity.
export function validateFinding(
  input: unknown,
  context: { revisionId: string; claimIds: string[]; evidence: Evidence[] },
): Finding {
  const finding = FindingSchema.parse(input);
  if (finding.revisionId !== context.revisionId) throw new Error('STALE_REVISION');
  if (!context.claimIds.includes(finding.claimId)) throw new Error('UNKNOWN_CLAIM');
  const evidence = new Map(context.evidence.map((e) => [e.id, EvidenceSchema.parse(e)]));
  if (new Set(finding.evidenceIds).size !== finding.evidenceIds.length)
    throw new Error('DUPLICATE_CITATION');
  for (const id of finding.evidenceIds) if (!evidence.has(id)) throw new Error('UNKNOWN_CITATION');
  const needsEvidence =
    !['insufficient_evidence', 'out_of_scope'].includes(finding.supportStatus) ||
    ['exact', 'normalized', 'mismatch'].includes(finding.quoteStatus);
  if (needsEvidence && finding.evidenceIds.length === 0) throw new Error('EVIDENCE_REQUIRED');
  return finding;
}
// Preserve original separately. This is a retrieval key, never a match verdict.
export function searchKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u064B-\u0652\u0670\u0640]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
export function providerFailure(status: number | 'timeout') {
  if (status === 403 || status === 401)
    return { outcome: 'unavailable', retryable: false } as const;
  if (status === 429 || status === 'timeout' || (typeof status === 'number' && status >= 500))
    return { outcome: 'unavailable', retryable: true } as const;
  return { outcome: 'invalid_response', retryable: false } as const;
}
export function assertEmbeddingCompatibility(
  a: { model: string; dimension: number },
  b: { model: string; dimension: number },
) {
  if (a.model !== b.model || a.dimension !== b.dimension)
    throw new Error('INCOMPATIBLE_EMBEDDINGS');
}

export * from './retrieval.js';
