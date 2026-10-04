import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  compareQuotation,
  extractClaimCandidates,
  retrieveEvidence,
  searchKey,
  type ClaimCandidate,
  type Evidence,
  type RetrievalPassage,
} from '../../../packages/contracts/src/index.js';

export const PreflightInputSchema = z
  .object({ text: z.string().trim().min(20).max(3000) })
  .strict();

const ContentTypeSchema = z.enum([
  'quran',
  'hadith_matn',
  'isnad',
  'claimed_source',
  'scholarly_statement',
  'interpretation',
  'general_claim',
  'unknown',
]);

export const PreflightAnnotationSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    contentType: ContentTypeSchema,
    contentTypeLabel: z.string().min(1),
    classificationBasis: z.enum(['cue', 'fixture_match', 'pattern', 'unknown']),
  })
  .strict()
  .refine((annotation) => annotation.endOffset > annotation.startOffset, {
    message: 'Preflight annotation offsets must be ordered',
  });

export type PreflightAnnotation = z.infer<typeof PreflightAnnotationSchema>;

const IssueCodeSchema = z.enum([
  'quotation_mismatch',
  'attribution_mismatch',
  'attribution_missing',
  'missing_qualification',
  'overgeneralization',
  'unsupported_exclusivity',
  'insufficient_evidence',
]);

export const PreflightFindingSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    contentType: ContentTypeSchema,
    contentTypeLabel: z.string().min(1),
    classificationBasis: z.enum(['cue', 'fixture_match', 'unknown']),
    issueCode: IssueCodeSchema.nullable(),
    severity: z.enum(['info', 'neutral', 'warning']),
    message: z.string().min(1),
    evidence: z
      .object({
        reference: z.string().min(1),
        excerpt: z.string().min(1),
        retrievalModes: z.array(z.enum(['exact', 'lexical', 'semantic'])).min(1),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((finding) => finding.endOffset > finding.startOffset, {
    message: 'Preflight offsets must be ordered',
  });

export type PreflightFinding = z.infer<typeof PreflightFindingSchema>;

export const PreflightResponseSchema = z
  .object({
    mode: z.literal('local_demo'),
    verification: z.literal(false),
    corpusVersion: z.literal('software-fixture-v1'),
    inputHash: z.string().length(64),
    offsetUnit: z.literal('utf16_code_unit'),
    annotations: z.array(PreflightAnnotationSchema).max(20),
    findings: z.array(PreflightFindingSchema).max(5),
    warnings: z.array(
      z.enum(['unbalanced_quotation_marks', 'candidate_limit_reached', 'no_claims_detected']),
    ),
  })
  .strict();

export type PreflightResponse = z.infer<typeof PreflightResponseSchema>;

type ContentType = z.infer<typeof ContentTypeSchema>;

const fixturePassages: RetrievalPassage[] = [
  {
    id: 'fixture-quran-baqara-271',
    sourceId: 'software-fixture-quran',
    sourceVersion: 'software-fixture-v1',
    reference: 'البقرة: ٢٧١',
    originalText: 'وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ',
    searchText: searchKey(
      'وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ إخفاء الصدقة',
    ),
    approvalStatus: 'approved',
    contextIds: [],
  },
  {
    id: 'fixture-hadith-intentions',
    sourceId: 'software-fixture-hadith',
    sourceVersion: 'software-fixture-v1',
    reference: 'صحيح البخاري: 1',
    originalText: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
    searchText: searchKey('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ الأعمال بالنيات'),
    approvalStatus: 'approved',
    contextIds: [],
  },
];

const fixtureTypes = new Map<string, ContentType>([
  ['fixture-quran-baqara-271', 'quran'],
  ['fixture-hadith-intentions', 'hadith_matn'],
]);

const typeLabels: Record<ContentType, string> = {
  quran: 'آية قرآنية',
  hadith_matn: 'متن حديث',
  isnad: 'إسناد / نسبة',
  claimed_source: 'مصدر مذكور',
  scholarly_statement: 'قول منسوب لعالم',
  interpretation: 'استنتاج أو تفسير',
  general_claim: 'ادعاء عام',
  unknown: 'غير مصنف',
};

function cueContentType(candidate: ClaimCandidate): ContentType {
  if (/(?:قال الله|قال تعالى|القرآن|آية|سورة)/u.test(candidate.text)) return 'quran';
  if (/(?:قال رسول الله|قال النبي|حديث|رواه البخاري|رواه مسلم|متفق عليه)/u.test(candidate.text))
    return 'hadith_matn';
  if (/(?:قال الشيخ|قال الإمام|قال العالم|ذكر العلماء|أجمع العلماء)/u.test(candidate.text))
    return 'scholarly_statement';
  if (
    candidate.claimType === 'interpretation' ||
    /(?:يدل|يعني|المقصود|يُفهم|يفهم)/u.test(candidate.text)
  )
    return 'interpretation';
  if (candidate.claimType === 'generalization' || candidate.claimType === 'exclusivity')
    return 'general_claim';
  return 'unknown';
}

function inlineClaimedSource(text: string): string | null {
  const bracketed = /\[([^\]\n]{2,120})\]/u.exec(text)?.[1]?.trim();
  if (bracketed) return bracketed;
  return (
    /سورة\s+[\p{Script=Arabic}\s]{2,40}?(?:،|,)\s*(?:الآية|آية)\s*[:：]?\s*[٠-٩0-9]+/u
      .exec(text)?.[0]
      ?.trim() ||
    /(?:صحيح البخاري|صحيح مسلم|سنن أبي داود|جامع الترمذي|سنن النسائي|سنن ابن ماجه|مسند أحمد|موطأ مالك)\s*[:：]?\s*[٠-٩0-9]+/u
      .exec(text)?.[0]
      ?.trim() ||
    null
  );
}

function annotationForCandidate(
  text: string,
  candidate: ClaimCandidate,
  contentType: ContentType,
  classificationBasis: PreflightAnnotation['classificationBasis'],
): PreflightAnnotation {
  const offsets = candidate.quotation
    ? findingOffsets(candidate, null)
    : { startOffset: candidate.startOffset, endOffset: candidate.endOffset };
  return PreflightAnnotationSchema.parse({
    id: `semantic-${candidate.id}`,
    text: text.slice(offsets.startOffset, offsets.endOffset),
    ...offsets,
    contentType,
    contentTypeLabel: typeLabels[contentType],
    classificationBasis,
  });
}

function structuralAnnotations(
  text: string,
  candidates: ClaimCandidate[],
  candidateTypes: Map<string, ContentType>,
): PreflightAnnotation[] {
  const annotations: PreflightAnnotation[] = [];

  for (const candidate of candidates) {
    if (candidateTypes.get(candidate.id) !== 'hadith_matn' || !candidate.quotation) continue;
    const quoteOffset = candidate.text.indexOf(candidate.quotation);
    if (quoteOffset <= 0) continue;
    const prefix = candidate.text.slice(0, quoteOffset).replace(/[«\s]+$/u, '');
    if (!/(?:عن\s|قال|روى|حدثنا|أخبرنا|رسول الله|النبي)/u.test(prefix)) continue;
    const startOffset = candidate.startOffset;
    const endOffset = startOffset + prefix.length;
    annotations.push(
      PreflightAnnotationSchema.parse({
        id: `isnad-${candidate.id}`,
        text: text.slice(startOffset, endOffset),
        startOffset,
        endOffset,
        contentType: 'isnad',
        contentTypeLabel: typeLabels.isnad,
        classificationBasis: 'pattern',
      }),
    );
  }

  const claimedSourceRanges: Array<{ startOffset: number; endOffset: number }> = [];
  const sourcePatterns = [
    /\[[^\]\n]{2,120}\]/gu,
    /سورة\s+[\p{Script=Arabic}\s]{2,40}?(?:،|,)\s*(?:الآية|آية)\s*[:：]?\s*[٠-٩0-9]+/gu,
    /(?:صحيح البخاري|صحيح مسلم|سنن أبي داود|جامع الترمذي|سنن النسائي|سنن ابن ماجه|مسند أحمد|موطأ مالك)\s*[:：]?\s*[٠-٩0-9]+/gu,
  ];
  for (const pattern of sourcePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      if (
        claimedSourceRanges.some(
          (range) => startOffset < range.endOffset && endOffset > range.startOffset,
        )
      )
        continue;
      claimedSourceRanges.push({ startOffset, endOffset });
      annotations.push(
        PreflightAnnotationSchema.parse({
          id: `claimed-source-${startOffset}`,
          text: match[0],
          startOffset,
          endOffset,
          contentType: 'claimed_source',
          contentTypeLabel: typeLabels.claimed_source,
          classificationBasis: 'pattern',
        }),
      );
    }
  }

  return annotations;
}

function findingOffsets(
  candidate: ClaimCandidate,
  issueCode: PreflightFinding['issueCode'],
): { startOffset: number; endOffset: number } {
  if (!candidate.quotation) {
    const issuePattern =
      issueCode === 'unsupported_exclusivity'
        ? /(?:فقط|وحده|حصراً|لا\s+[^.،؛؟!\n]{1,80}\s+إلا)/u
        : issueCode === 'overgeneralization'
          ? /(?:دائم[ًاا]?|كل\s+[^.،؛؟!\n]{1,40}|جميع|يجب|لا يجوز|الأفضل)/u
          : issueCode === 'missing_qualification'
            ? /(?:يدل|يعني|المقصود|يُفهم|يفهم)/u
            : null;
    const issueMatch = issuePattern?.exec(candidate.text);
    if (!issueMatch || issueMatch.index === undefined)
      return { startOffset: candidate.startOffset, endOffset: candidate.endOffset };
    return {
      startOffset: candidate.startOffset + issueMatch.index,
      endOffset: candidate.startOffset + issueMatch.index + issueMatch[0].length,
    };
  }
  const relativeStart = candidate.text.indexOf(candidate.quotation);
  if (relativeStart < 0)
    return { startOffset: candidate.startOffset, endOffset: candidate.endOffset };
  return {
    startOffset: candidate.startOffset + relativeStart,
    endOffset: candidate.startOffset + relativeStart + candidate.quotation.length,
  };
}

function evidenceFor(result: ReturnType<typeof retrieveEvidence>[number]): Evidence {
  return {
    id: result.passage.id,
    sourceId: result.passage.sourceId,
    sourceVersion: result.passage.sourceVersion,
    reference: result.passage.reference,
    originalText: result.passage.originalText,
    retrievedAt: '2026-10-03T00:00:00.000Z',
    delivery: 'snapshot',
  };
}

function issueFor(
  candidate: ClaimCandidate,
  matched: ReturnType<typeof retrieveEvidence>[number] | undefined,
): Pick<PreflightFinding, 'issueCode' | 'severity' | 'message'> {
  if (candidate.quotation) {
    if (!matched)
      return {
        issueCode: 'insufficient_evidence',
        severity: 'neutral',
        message: 'لم نجد في المرجع التجريبي المحدود نصًا كافيًا لمقارنة هذا الاقتباس.',
      };
    const comparison = compareQuotation({
      quotedText: candidate.quotation,
      claimedReference: candidate.reference,
      evidence: evidenceFor(matched),
    });
    if (comparison.quoteStatus === 'mismatch')
      return {
        issueCode: 'quotation_mismatch',
        severity: 'warning',
        message: 'قد يكون الاقتباس ناقصًا أو مختلفًا عن النص الموجود في المرجع التجريبي.',
      };
    if (comparison.attributionStatus === 'mismatch')
      return {
        issueCode: 'attribution_mismatch',
        severity: 'warning',
        message: 'النص قريب من المرجع التجريبي، لكن الإحالة المكتوبة لا تطابقه.',
      };
    if (comparison.attributionStatus === 'missing')
      return {
        issueCode: 'attribution_missing',
        severity: 'neutral',
        message: 'تعرّفنا على النص، لكن المسودة لا تتضمن إحالة محددة يمكن التحقق منها.',
      };
    return {
      issueCode: null,
      severity: 'info',
      message: 'تطابق أولي داخل المرجع البرمجي التجريبي؛ هذا ليس حكمًا شرعيًا أو اعتمادًا للنشر.',
    };
  }

  if (candidate.claimType === 'exclusivity')
    return {
      issueCode: 'unsupported_exclusivity',
      severity: 'warning',
      message: 'تتضمن العبارة حصرًا يحتاج إلى دليل صريح قبل اعتماده.',
    };
  if (candidate.claimType === 'generalization')
    return {
      issueCode: 'overgeneralization',
      severity: 'warning',
      message: 'تتضمن العبارة تعميمًا واسعًا يحتاج إلى تقييد وربط أوضح بالدليل.',
    };
  if (candidate.claimType === 'interpretation')
    return {
      issueCode: 'missing_qualification',
      severity: 'warning',
      message: 'هذا استنتاج يحتاج إلى بيان حدوده والسياق الذي يستند إليه.',
    };
  if (candidate.claimType === 'attribution' && !matched)
    return {
      issueCode: 'insufficient_evidence',
      severity: 'neutral',
      message: 'وجدنا نسبةً إلى مصدر، لكن المرجع التجريبي المحدود لا يكفي للتحقق منها.',
    };
  return {
    issueCode: null,
    severity: 'info',
    message: 'صُنفت العبارة مبدئيًا ولم يظهر تنبيه في الفحص المحلي المحدود.',
  };
}

export function buildDemoPreflight(input: unknown): PreflightResponse {
  const { text } = PreflightInputSchema.parse(input);
  const extraction = extractClaimCandidates(text);
  const candidateTypes = new Map<string, ContentType>();
  const candidateBases = new Map<string, PreflightAnnotation['classificationBasis']>();
  const findings = extraction.candidates.map((candidate) => {
    const candidateWithReference: ClaimCandidate = candidate.reference
      ? candidate
      : { ...candidate, reference: inlineClaimedSource(candidate.text) };
    const cueType = cueContentType(candidateWithReference);
    const results = retrieveEvidence({
      query: candidateWithReference.quotation ?? candidateWithReference.text,
      reference: candidateWithReference.reference,
      passages: fixturePassages,
      limit: 3,
    });
    const matched =
      results.find((result) => fixtureTypes.get(result.passage.id) === cueType) ??
      results.find((result) => result.retrievalModes.includes('exact'));
    const matchedType = matched ? fixtureTypes.get(matched.passage.id) : undefined;
    const contentType = matchedType ?? cueType;
    const classificationBasis = matchedType
      ? 'fixture_match'
      : cueType === 'unknown'
        ? 'unknown'
        : 'cue';
    candidateTypes.set(candidate.id, contentType);
    candidateBases.set(candidate.id, classificationBasis);
    const issue = issueFor(candidateWithReference, matched);
    const offsets = findingOffsets(candidate, issue.issueCode);
    return PreflightFindingSchema.parse({
      id: candidate.id,
      text: text.slice(offsets.startOffset, offsets.endOffset),
      ...offsets,
      contentType,
      contentTypeLabel: typeLabels[contentType],
      classificationBasis,
      ...issue,
      evidence: matched
        ? {
            reference: matched.passage.reference,
            excerpt: matched.passage.originalText,
            retrievalModes: matched.retrievalModes,
          }
        : null,
    });
  });
  const annotations = [
    ...extraction.candidates.map((candidate) =>
      annotationForCandidate(
        text,
        candidate,
        candidateTypes.get(candidate.id) ?? 'unknown',
        candidateBases.get(candidate.id) ?? 'unknown',
      ),
    ),
    ...structuralAnnotations(text, extraction.candidates, candidateTypes),
  ].sort(
    (left, right) =>
      left.startOffset - right.startOffset ||
      left.endOffset - right.endOffset ||
      left.id.localeCompare(right.id),
  );

  return PreflightResponseSchema.parse({
    mode: 'local_demo',
    verification: false,
    corpusVersion: 'software-fixture-v1',
    inputHash: createHash('sha256').update(text).digest('hex'),
    offsetUnit: 'utf16_code_unit',
    annotations,
    findings,
    warnings: extraction.warnings,
  });
}
