import { z } from 'zod';
import type { FoundationIntake, IntakeSegment, SourceEvidence } from './foundation.js';

export const THEME_DETECTOR_VERSION = 'authored-lexical-v1.1';
export const THEME_IDS = [
  'prayer',
  'charity',
  'zakah',
  'fasting',
  'pilgrimage',
  'ethics',
  'faith',
  'transactions',
  'family',
] as const;
export const ThemeIdSchema = z.enum(THEME_IDS);
export type ThemeId = z.infer<typeof ThemeIdSchema>;
export const THEME_LABELS: Record<ThemeId, string> = {
  prayer: 'الصلاة والطهارة',
  charity: 'الصدقة',
  zakah: 'الزكاة',
  fasting: 'الصيام',
  pilgrimage: 'الحج والعمرة',
  ethics: 'الأخلاق',
  faith: 'الإيمان والعقيدة',
  transactions: 'المعاملات',
  family: 'الأسرة',
};
const AnchorSchema = z
  .object({
    segmentId: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    originalText: z.string().min(1),
    mentionStatus: z.enum(['assertive', 'nonassertive']),
    normative: z.boolean(),
  })
  .strict();
export const ThemeAnalysisSchema = z
  .object({
    detectorVersion: z.enum(['authored-lexical-v1', THEME_DETECTOR_VERSION]),
    status: z.enum(['identified', 'unknown']),
    calibration: z.literal('uncalibrated'),
    primaryTheme: ThemeIdSchema.nullable(),
    authoredThemes: z
      .array(
        z
          .object({
            theme: ThemeIdSchema,
            mentionStatus: z.enum(['assertive', 'nonassertive']),
            charitySubtype: z.enum(['undetermined', 'voluntary', 'obligatory']).nullable(),
            anchors: z.array(AnchorSchema).min(1).max(80),
          })
          .strict(),
      )
      .max(9),
    citedContextThemes: z
      .array(
        z
          .object({ theme: ThemeIdSchema, evidenceKeys: z.array(z.string().min(1)).min(1).max(80) })
          .strict(),
      )
      .max(9),
    limitations: z.array(z.string()).max(10),
  })
  .strict();
export type ThemeAnalysis = z.infer<typeof ThemeAnalysisSchema>;
export const ImprovementCardSchema = z
  .object({
    id: z.string().min(1),
    ruleId: z.enum([
      'citation-conflict',
      'literal-mismatch',
      'charity-undetermined',
      'normative-source-gap',
    ]),
    title: z.string().min(1),
    explanation: z.string().min(1),
    limitation: z.string().min(1),
    trigger: AnchorSchema,
    evidenceKeys: z.array(z.string().min(1)).min(1).max(20),
    relatedContextOnly: z.literal(true),
    associationStatus: z
      .enum(['not_applicable', 'unconfirmed_candidate', 'no_nearby_candidate'])
      .optional(),
    suggestedDraft: z.string().min(1).max(3000).nullable(),
  })
  .strict();
export type ImprovementCard = z.infer<typeof ImprovementCardSchema>;

// This is our bounded editorial catalog, not a provider-owned or scholarly-reviewed annotation.
export const THEME_CATALOG: Readonly<Record<ThemeId, readonly string[]>> = {
  prayer: ['2:43'],
  charity: ['2:271'],
  zakah: ['9:60', '9:103'],
  fasting: ['2:183'],
  pilgrimage: ['3:97'],
  ethics: ['49:11'],
  faith: ['112:1', '2:256'],
  transactions: ['2:275'],
  family: ['4:19'],
};
const LEXICON: Record<ThemeId, RegExp> = {
  prayer: /صلا[ةه]|صلوات|الوضوء|وضوء|وضو|التيمم/gu,
  charity: /صدق[ةه]|صدقات|الصدقات|تبرع/gu,
  zakah: /زكا[ةه]|نصاب|الحول/gu,
  fasting: /صيام|الصوم|صوم|رمضان|افطار|سحور|زكا[ةه] الفطر/gu,
  pilgrimage: /الحج|حج|عمرة|طواف|احرام|مناسك/gu,
  ethics: /اخلاق|الصدق|الامان[ةه]|امان[ةه]|كذب|الكذب|غيب[ةه]|سخري[ةه]/gu,
  faith: /ايمان|توحيد|عقيد[ةه]|الشرك/gu,
  transactions: /معاملات|الربا|ربا|البيع|بيع|شراء|القرض|قرض/gu,
  family: /اسر[ةه]|اسرت(?:ي|نا|هم|ك)|زواج|طلاق|الزوجين|الزوج[ةه]|الوالدين/gu,
};
const NORMATIVE = /يجب|واجب|فريض[ةه]|فرض|حرام|حلال|لا يجوز|ينبغي|احكام|حكم\s/u;
const NONASSERTIVE =
  /(?:^|\s)(?:لو|اذا)\s|(?:^|\s)ان\s+(?:ناقشنا|كتبنا|تحدثنا)|(?:ليس|ليست|غير)\b|(?:ليس|ليست).{0,60}عن|لا\s+(?:نتحدث|نكتب|اتحدث)\s+عن|(?:قال|ذكر|نقل)\s+(?:الكاتب|الباحث|فلان)/u;

function normalizedWithOffsets(text: string): { text: string; starts: number[]; ends: number[] } {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    if (!/[\u064B-\u065F\u0670\u0640]/u.test(character)) {
      const replacement = character.replace(/[أإآ]/u, 'ا').replace(/ى/u, 'ي');
      normalized += replacement;
      for (let index = 0; index < replacement.length; index += 1) {
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  return { text: normalized, starts, ends };
}

function clauseAt(text: string, index: number): string {
  const before =
    text
      .slice(0, index)
      .split(/[.؛!؟\n]/u)
      .at(-1) ?? '';
  const after = text.slice(index).split(/[.؛!؟\n]/u)[0] ?? '';
  return before + after;
}

function segmentAnchors(segment: IntakeSegment, theme: ThemeId): z.infer<typeof AnchorSchema>[] {
  const normalized = normalizedWithOffsets(segment.originalText);
  const words = new RegExp(
    `(?<![\\p{L}])(?:[وفبكل]{0,2}(?:ال)?|ال)?(?:${LEXICON[theme].source})(?![\\p{L}])`,
    'gu',
  );
  return [...normalized.text.matchAll(words)].slice(0, 80).map((match) => {
    const start = normalized.starts[match.index] ?? 0;
    const end = normalized.ends[match.index + match[0].length - 1] ?? start + match[0].length;
    const clause = clauseAt(normalized.text, match.index);
    const nonassertive = NONASSERTIVE.test(clause);
    return {
      segmentId: segment.id,
      startOffset: segment.startOffset + start,
      endOffset: segment.startOffset + end,
      originalText: segment.originalText.slice(start, end),
      mentionStatus: nonassertive ? ('nonassertive' as const) : ('assertive' as const),
      normative: !nonassertive && NORMATIVE.test(clause),
    };
  });
}

function referenceKey(reference: string): string | null {
  const digits = reference.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = digits.match(/(?:^|\D)(\d{1,3}):(\d{1,3})(?:\D|$)/u);
  return match ? `${Number(match[1])}:${Number(match[2])}` : null;
}

function evidenceFor(intake: FoundationIntake, references: readonly string[]): SourceEvidence[] {
  return intake.evidence.filter(
    (item) =>
      item.sourceRole === 'quran_text' &&
      references.includes(referenceKey(item.reference) ?? '') &&
      item.approvalStatus !== 'rejected' &&
      item.approvalStatus !== 'revoked',
  );
}

// Subtype labels describe explicit authored wording, not an inferred religious ruling.
// Ignore a negated cue and reset its narrow scope at an explicit contrast.
function positiveSubtypeCue(clauses: string, cue: RegExp): boolean {
  for (const clause of clauses.split(/[.؛!؟\n]|(?:\s)(?:بل|لكن|ولكن)(?:\s)/u)) {
    for (const match of clause.matchAll(cue)) {
      const preceding = clause.slice(0, match.index).trim().split(/\s+/u).slice(-4).join(' ');
      if (!/(?:^|\s)[وف]?(?:لا|لم|لن|ليس|ليست|ليسوا|لست|غير|بلا|دون)(?:\s|$)/u.test(preceding))
        return true;
    }
  }
  return false;
}

export function analyzeThemes(intake: FoundationIntake): ThemeAnalysis {
  const authored = intake.segments.filter((segment) => segment.role === 'author_text');
  const authoredThemes: ThemeAnalysis['authoredThemes'] = [];
  for (const theme of THEME_IDS) {
    const anchors = authored.flatMap((segment) => segmentAnchors(segment, theme)).slice(0, 80);
    if (!anchors.length) continue;
    const assertive = anchors.some((anchor) => anchor.mentionStatus === 'assertive');
    let charitySubtype: 'undetermined' | 'voluntary' | 'obligatory' | null = null;
    if (theme === 'charity') {
      const clauses = anchors
        .filter((anchor) => anchor.mentionStatus === 'assertive')
        .map((anchor) => {
          const segment = authored.find((item) => item.id === anchor.segmentId)!;
          const normalized = normalizedWithOffsets(segment.originalText);
          const index = normalizedWithOffsets(
            segment.originalText.slice(0, anchor.startOffset - segment.startOffset),
          ).text.length;
          return clauseAt(normalized.text, index);
        })
        .join(' ');
      const voluntary = positiveSubtypeCue(
        clauses,
        /(?<![\p{L}])(?:[وفبكل]{0,2}(?:ال)?|ال)?(?:تطوع|طوعي|نافل[ةه])(?![\p{L}])/gu,
      );
      const obligatory = positiveSubtypeCue(
        clauses,
        /(?<![\p{L}])(?:[وفبكل]{0,2}(?:ال)?|ال)?(?:نصاب|زكا[ةه]|فريض[ةه])(?![\p{L}])|(?:حال|مر)\s+علي(?:ه|ها)\s+الحول|(?:تمام|اكتمال)\s+الحول|حول\s+كامل/gu,
      );
      charitySubtype =
        voluntary && !obligatory
          ? 'voluntary'
          : obligatory && !voluntary
            ? 'obligatory'
            : 'undetermined';
    }
    authoredThemes.push({
      theme,
      mentionStatus: assertive ? 'assertive' : 'nonassertive',
      charitySubtype,
      anchors,
    });
  }
  const ranked = authoredThemes
    .map((item) => ({
      theme: item.theme,
      count: item.anchors.filter((anchor) => anchor.mentionStatus === 'assertive').length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const primaryTheme =
    ranked[0] && (!ranked[1] || ranked[0].count >= ranked[1].count * 2) ? ranked[0].theme : null;
  const citedKeys = new Set(
    intake.segments
      .filter((segment) => segment.role !== 'author_text')
      .flatMap((segment) => segment.sourceKeys),
  );
  const citedContextThemes = THEME_IDS.flatMap((theme) => {
    const evidenceKeys = evidenceFor(intake, THEME_CATALOG[theme])
      .filter((item) => citedKeys.has(item.snapshotKey))
      .map((item) => item.snapshotKey);
    return evidenceKeys.length ? [{ theme, evidenceKeys }] : [];
  });
  return ThemeAnalysisSchema.parse({
    detectorVersion: THEME_DETECTOR_VERSION,
    status: authoredThemes.length ? 'identified' : 'unknown',
    calibration: 'uncalibrated',
    primaryTheme,
    authoredThemes,
    citedContextThemes,
    limitations: [
      'اقتراحات آلية غير محكَّمة علميًا',
      'التصنيف معجمي محلي؛ الموضوع لا يحكم على صحة المعنى.',
      'فهرس الموضوعات من إعداد المشروع ويحتاج إلى مراجعة مستقلة.',
    ],
  });
}

export function catalogRelevantReferences(themes: ThemeAnalysis): string[] {
  return [
    ...new Set(
      themes.authoredThemes
        .filter((item) => item.anchors.some((anchor) => anchor.normative))
        .flatMap((item) => THEME_CATALOG[item.theme]),
    ),
  ].slice(0, 10);
}

export function suggestImprovements(
  intake: FoundationIntake,
  themes: ThemeAnalysis,
): ImprovementCard[] {
  const cards: ImprovementCard[] = [];
  const identities = new Set<string>();
  const add = (
    ruleId: ImprovementCard['ruleId'],
    title: string,
    explanation: string,
    trigger: ImprovementCard['trigger'],
    evidence: SourceEvidence[],
    associationStatus: NonNullable<ImprovementCard['associationStatus']> = 'not_applicable',
    identity = `${trigger.segmentId}:${trigger.startOffset}:${trigger.endOffset}`,
  ) => {
    const key = `${ruleId}:${identity}`;
    if (!evidence.length || identities.has(key) || cards.length >= 3) return;
    identities.add(key);
    cards.push(
      ImprovementCardSchema.parse({
        id: `${intake.revisionId}:${ruleId}:${trigger.startOffset}`,
        ruleId,
        title,
        explanation,
        trigger,
        evidenceKeys: evidence.map((item) => item.snapshotKey).slice(0, 20),
        relatedContextOnly: true,
        associationStatus,
        suggestedDraft: null,
        limitation:
          'هذه مواد لفحص السياق فقط؛ لم يُقيَّم الاستدلال ولم تُعتمد الطبعات علميًا. لا تضف اقتباسًا قبل قراءة سياقه.',
      }),
    );
  };
  const quoteTrigger = (segment: IntakeSegment): ImprovementCard['trigger'] => ({
    segmentId: segment.id,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    originalText: segment.originalText,
    mentionStatus: 'nonassertive',
    normative: false,
  });
  for (const segment of intake.segments.filter((item) => item.conflict)) {
    add(
      'citation-conflict',
      'راجع نسبة الاقتباس',
      'تعارضت نسبة العبارة مع نتيجة التعرف على المصدر. راجع الأصل والنسبة قبل النشر.',
      quoteTrigger(segment),
      intake.evidence.filter((item) => segment.sourceKeys.includes(item.snapshotKey)),
    );
  }
  for (const finding of intake.quotationFindings.filter((item) => item.status === 'mismatch')) {
    const segment = intake.segments.find((item) => item.id === finding.segmentId);
    if (!segment) continue;
    add(
      'literal-mismatch',
      'راجع ألفاظ الاقتباس',
      'رصدت المقارنة الحرفية اختلافًا. قارن العبارة بالنص الأصلي ولا تغيّر النقل بصمت.',
      quoteTrigger(segment),
      intake.evidence.filter((item) => item.snapshotKey === finding.evidenceKey),
    );
  }
  for (const item of themes.authoredThemes) {
    const related = evidenceFor(intake, THEME_CATALOG[item.theme]);
    for (const trigger of item.anchors.filter((anchor) => anchor.normative)) {
      const bounds = sentenceBounds(intake.originalText, trigger.startOffset, trigger.endOffset);
      const identity = `${bounds.start}:${bounds.end}`;
      if (item.theme === 'charity' && item.charitySubtype === 'undetermined') {
        add(
          'charity-undetermined',
          'حدّد نوع الصدقة',
          'هل تقصد صدقة التطوع أم الزكاة الواجبة؟ النص لم يحدد النوع. حرّر المقصود ثم افحص السياق.',
          trigger,
          related,
          'not_applicable',
          identity,
        );
      }
      const candidates = intake.segments
        .filter(
          (segment) =>
            segment.role !== 'author_text' &&
            segment.startOffset < bounds.end &&
            segment.endOffset > bounds.start &&
            segment.sourceKeys.length > 0,
        )
        .flatMap((segment) => segment.sourceKeys);
      const localRelated = related.filter((source) => candidates.includes(source.snapshotKey));
      add(
        'normative-source-gap',
        localRelated.length ? 'راجع صلة العبارة بالمصدر القريب' : 'راجع مصدر العبارة الحكمية',
        localRelated.length
          ? 'توجد عبارة حكمية واقتباس قريب من موضوعها في الجملة نفسها. العلاقة مرشحة غير مؤكدة؛ تحقق من ارتباط العبارة بهذا المصدر قبل النشر.'
          : 'وردت عبارة حكمية دون مصدر قريب من موضوعها في الجملة نفسها. اقتباس آخر في النص لا يحسم ارتباط هذه العبارة بمصدر. هذه آية مرتبطة بالموضوع للفحص فقط.',
        trigger,
        localRelated.length ? localRelated : related,
        localRelated.length ? 'unconfirmed_candidate' : 'no_nearby_candidate',
        identity,
      );
    }
  }
  return cards;
}

function sentenceBounds(text: string, start: number, end: number): { start: number; end: number } {
  let left = start;
  let right = end;
  while (left > 0 && !/[.؛!؟\n]/u.test(text[left - 1]!)) left -= 1;
  while (right < text.length && !/[.؛!؟\n]/u.test(text[right]!)) right += 1;
  return { start: left, end: right };
}
