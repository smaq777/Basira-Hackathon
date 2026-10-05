import { describe, expect, it } from 'vitest';
import {
  analyzeThemes,
  catalogRelevantReferences,
  suggestImprovements,
  ThemeAnalysisSchema,
  ImprovementCardSchema,
} from './themes.js';
import { fixtureIntake, fixtureEvidence } from './themes.fixtures.js';
import type { FoundationIntake, IntakeSegment } from './foundation.js';

function mixedIntake(
  parts: { text: string; role: IntakeSegment['role']; reference?: string; conflict?: boolean }[],
): FoundationIntake {
  const intake = fixtureIntake(parts.map((part) => part.text).join(' '));
  let offset = 0;
  intake.segments = parts.map((part, index) => {
    const start = offset;
    offset += part.text.length + 1;
    return {
      id: `segment-${index}`,
      startOffset: start,
      endOffset: start + part.text.length,
      codePointStart: [...intake.originalText.slice(0, start)].length,
      codePointEnd: [...intake.originalText.slice(0, start + part.text.length)].length,
      originalText: part.text,
      role: part.role,
      roleStatus: part.reference ? 'source_matched' : 'candidate',
      sourceKeys: part.reference ? [fixtureEvidence(part.reference).snapshotKey] : [],
      roleProposal: null,
      conflict: part.conflict ?? false,
      method: 'authored-challenge-fixture',
    };
  });
  return intake;
}

describe('theme-aware editorial assistance', () => {
  it('separates author themes from catalog citation themes and does not force a tie', () => {
    const intake = fixtureIntake('يجب المحافظة على الصلاة ودفع الزكاة.');
    const result = analyzeThemes(intake);
    expect(result.authoredThemes.map((item) => item.theme)).toEqual(['prayer', 'zakah']);
    expect(result.primaryTheme).toBeNull();
    expect(result.citedContextThemes).toEqual([]);
    expect(ThemeAnalysisSchema.parse(result)).toEqual(result);
  });
  it('does not read cited Quran as author wording;9:60 is zakah context', () => {
    const intake = fixtureIntake('إنما الصدقات للفقراء والمساكين');
    intake.segments[0]!.role = 'ayah';
    intake.segments[0]!.roleStatus = 'source_matched';
    intake.segments[0]!.sourceKeys = [fixtureEvidence('9:60').snapshotKey];
    const result = analyzeThemes(intake);
    expect(result.authoredThemes).toEqual([]);
    expect(result.citedContextThemes.map((item) => item.theme)).toEqual(['zakah']);
    expect(suggestImprovements(intake, result)).toEqual([]);
  });
  it('distinguishes an unspecified charity type from explicitly voluntary charity', () => {
    expect(
      analyzeThemes(fixtureIntake('الصدقة واجبة على كل مسلم.')).authoredThemes[0]?.charitySubtype,
    ).toBe('undetermined');
    expect(
      analyzeThemes(fixtureIntake('صدقة التطوع جميلة.')).authoredThemes[0]?.charitySubtype,
    ).toBe('voluntary');
    expect(
      analyzeThemes(fixtureIntake('صدقات الزكاة عند اكتمال النصاب.')).authoredThemes.find(
        (item) => item.theme === 'charity',
      )?.charitySubtype,
    ).toBe('obligatory');
  });
  it('does not mistake charity for truthfulness or ordinary موضوع for purification', () => {
    const result = analyzeThemes(fixtureIntake('هذا موضوع عن الصدقة.'));
    expect(result.authoredThemes.map((item) => item.theme)).toEqual(['charity']);
  });
  it.each([
    ['مقال حول الصدقة.', 'undetermined'],
    ['الصدقة ليست فريضة.', 'undetermined'],
    ['الصدقة ليست فريضة بل تطوع.', 'voluntary'],
    ['الصدقة ليست تطوعا بل فريضة.', 'obligatory'],
    ['الصدقة عند اكتمال الحول.', 'obligatory'],
    ['صدقة نافلة وليست زكاة.', 'voluntary'],
  ])('keeps subtype cues bounded and does not infer from negated words: %s', (text, expected) => {
    expect(
      analyzeThemes(fixtureIntake(text)).authoredThemes.find((item) => item.theme === 'charity')
        ?.charitySubtype,
    ).toBe(expected);
  });
  it.each([
    'لو تحدثنا عن الصلاة لذكرنا المصدر.',
    'قال الكاتب: يجب إخفاء الصدقة.',
    'هذا النص ليس عن الزكاة.',
    'أشعر بالراحة بعد الصلاة.',
  ])('suppresses cards for nonassertive/personal text: %s', (text) => {
    const intake = fixtureIntake(text);
    expect(suggestImprovements(intake, analyzeThemes(intake))).toEqual([]);
  });
  it('preserves a normative prohibition instead of treating all لا as mention negation', () => {
    const result = analyzeThemes(fixtureIntake('لا يجوز ترك الصلاة.'));
    expect(result.authoredThemes[0]?.anchors[0]?.normative).toBe(true);
  });
  it('offers at most three cards with actual evidence, exact original offsets and no fabricated draft', () => {
    const intake = fixtureIntake('👩‍💻 يجب إخفاء الصدقة دائمًا.');
    const themes = analyzeThemes(intake);
    const cards = suggestImprovements(intake, themes);
    expect(cards.map((item) => item.ruleId)).toEqual([
      'charity-undetermined',
      'normative-source-gap',
    ]);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const card of cards) {
      expect(ImprovementCardSchema.parse(card)).toEqual(card);
      expect(intake.originalText.slice(card.trigger.startOffset, card.trigger.endOffset)).toBe(
        card.trigger.originalText,
      );
      expect(
        card.evidenceKeys.every((key) =>
          intake.evidence.some((source) => source.snapshotKey === key),
        ),
      ).toBe(true);
      expect(card.suggestedDraft).toBeNull();
      expect(`${card.title} ${card.explanation}`).not.toMatch(/يدل على|يثبت|supports|proves/iu);
    }
  });
  it('does not pad citations on personal prose or without available catalog sources', () => {
    const intake = fixtureIntake('يجب الحفاظ على الصلاة.', false);
    expect(suggestImprovements(intake, analyzeThemes(intake))).toEqual([]);
    expect(catalogRelevantReferences(analyzeThemes(fixtureIntake('أحب أجواء رمضان.')))).toEqual([]);
    expect(analyzeThemes(fixtureIntake('دفتر أزرق.')).status).toBe('unknown');
  });
  it('handles diacritics and surrogate pairs without changing source text', () => {
    const intake = fixtureIntake('👩‍💻 يَجِبُ بَيَانُ حُكْمِ الصَّلَاةِ.');
    const original = intake.originalText;
    const result = analyzeThemes(intake);
    expect(result.authoredThemes[0]?.theme).toBe('prayer');
    for (const anchor of result.authoredThemes[0]!.anchors) {
      expect(original.slice(anchor.startOffset, anchor.endOffset)).toBe(anchor.originalText);
    }
    expect(intake.originalText).toBe(original);
  });
  it('pins quote-error triggers to the offending quotation rather than an unrelated first topic', () => {
    const intake = mixedIntake([
      { text: 'يجب بيان أحكام الصلاة.', role: 'author_text' },
      { text: '«إنما الصدقات للفقراء والمساكين»', role: 'ayah', reference: '9:60', conflict: true },
    ]);
    intake.quotationFindings = [
      {
        segmentId: 'segment-1',
        evidenceKey: fixtureEvidence('9:60').snapshotKey,
        status: 'mismatch',
        reason: 'Engineering comparison challenge',
        matchedStart: null,
        matchedEnd: null,
      },
    ];
    const cards = suggestImprovements(intake, analyzeThemes(intake));
    for (const rule of ['citation-conflict', 'literal-mismatch']) {
      const card = cards.find((item) => item.ruleId === rule)!;
      expect(card.trigger.segmentId).toBe('segment-1');
      expect(card.trigger.originalText).toBe(intake.segments[1]!.originalText);
      expect(card.evidenceKeys).toEqual([fixtureEvidence('9:60').snapshotKey]);
      expect(intake.originalText.slice(card.trigger.startOffset, card.trigger.endOffset)).toBe(
        card.trigger.originalText,
      );
    }
  });
  it('can report an actual quote error without a normative authored claim', () => {
    const intake = mixedIntake([
      { text: '«إنما الصدقات للفقراء»', role: 'ayah', reference: '9:60', conflict: true },
    ]);
    expect(suggestImprovements(intake, analyzeThemes(intake)).map((item) => item.ruleId)).toEqual([
      'citation-conflict',
    ]);
  });
  it('does not let a first citation suppress a separate normative claim in another sentence', () => {
    const intake = mixedIntake([
      { text: '«وأقيموا الصلاة»', role: 'ayah', reference: '2:43' },
      { text: 'يجب بيان حكم الصلاة.', role: 'author_text' },
      { text: 'يجب دفع الزكاة عند اكتمال الشروط.', role: 'author_text' },
    ]);
    const cards = suggestImprovements(intake, analyzeThemes(intake));
    const prayer = cards.find((card) => card.trigger.originalText.includes('الصلاة'))!;
    const zakah = cards.find((card) => card.trigger.originalText.includes('الزكاة'))!;
    expect(prayer.associationStatus).toBe('unconfirmed_candidate');
    expect(zakah.ruleId).toBe('normative-source-gap');
    expect(zakah.associationStatus).toBe('no_nearby_candidate');
    expect(zakah.evidenceKeys).not.toContain(fixtureEvidence('2:43').snapshotKey);
  });
  it('checks a second claim about the same theme and does not equate adjacency with confirmation', () => {
    const intake = mixedIntake([
      { text: '«وأقيموا الصلاة»', role: 'ayah', reference: '2:43' },
      { text: 'يجب المحافظة على الصلاة.', role: 'author_text' },
      { text: 'لا يجوز ترك الصلاة.', role: 'author_text' },
    ]);
    const cards = suggestImprovements(intake, analyzeThemes(intake)).filter(
      (item) => item.ruleId === 'normative-source-gap',
    );
    expect(cards).toHaveLength(2);
    expect(cards.map((item) => item.associationStatus)).toEqual([
      'unconfirmed_candidate',
      'no_nearby_candidate',
    ]);
    expect(new Set(cards.map((item) => item.id)).size).toBe(2);
  });
  it('does not treat administrative age or embedded letters as pilgrimage/family themes', () => {
    const intake = fixtureIntake('يجب مراجعة عمره قبل تسجيله. هذه شركة خاسرة.');
    const themes = analyzeThemes(intake);
    expect(themes.status).toBe('unknown');
    expect(catalogRelevantReferences(themes)).toEqual([]);
    expect(suggestImprovements(intake, themes)).toEqual([]);
    expect(
      analyzeThemes(fixtureIntake('ينبغي بيان أحكام العمرة.')).authoredThemes.map(
        (item) => item.theme,
      ),
    ).toEqual(['pilgrimage']);
  });
});
