import { expect, it } from 'vitest';
import { assessClaimApplicability } from './claim-applicability.js';
import { LiteralFindingSchema, type FoundationIntake, type IntakeSegment } from './foundation.js';

function input(text: string, spans: { text: string; role: IntakeSegment['role'] }[] = []) {
  const segments = spans.map((span, index) => {
    const start = text.indexOf(span.text);
    return {
      id: `s${index}`,
      startOffset: start,
      endOffset: start + span.text.length,
      codePointStart: start,
      codePointEnd: start + span.text.length,
      originalText: span.text,
      role: span.role,
      roleStatus: 'unresolved' as const,
      method: 'fixture',
      sourceKeys: [],
      roleProposal: null,
      conflict: false,
    };
  });
  if (!segments.length)
    segments.push({
      id: 'author',
      startOffset: 0,
      endOffset: text.length,
      codePointStart: 0,
      codePointEnd: text.length,
      originalText: text,
      role: 'author_text',
      roleStatus: 'unresolved',
      method: 'fixture',
      sourceKeys: [],
      roleProposal: null,
      conflict: false,
    });
  return { originalText: text, segments } satisfies Pick<
    FoundationIntake,
    'originalText' | 'segments'
  >;
}

it('recognizes a bounded question without implying religious correctness', () => {
  expect(assessClaimApplicability(input('ما معنى التوحيد وأنواعه الثلاثة؟'))).toEqual({
    status: 'not_applicable',
    reason: 'question_and_quotations_only',
  });
});

it('keeps the supplied question, ayah and narration separate from an asserted conclusion', () => {
  const ayah = 'وَإِنْ سَأَلْتَهُمْ مَنْ خَلَقَ السَّمَاوَاتِ لَيَقُولُنَّ اللَّهُ';
  const matn = 'إنك تأتي قوماً من أهل الكتاب، فادعهم إلى شهادة أن لا إله إلا الله';
  const reference = 'سورة الزمر، الآية: 38';
  const isnad = 'عن معاذ بن جبل رضي الله عنه قال: قال رسول الله صلى الله عليه وسلم';
  const text = `ما معنى التوحيد وأنواعه الثلاثة؟ قال تعالى: «${ayah}» (${reference}). ${isnad}: «${matn}».`;
  const report = input(text, [
    { text: ayah, role: 'ayah' },
    { text: reference, role: 'claimed_source' },
    { text: isnad, role: 'isnad' },
    { text: matn, role: 'matn' },
  ]);
  expect(assessClaimApplicability(report)).toEqual({
    status: 'not_applicable',
    reason: 'question_and_quotations_only',
  });
  expect(
    assessClaimApplicability({ ...report, originalText: text + ' لذلك يجب هذا العمل.' }),
  ).toEqual({
    status: 'applicable',
    reason: 'assertion_present',
  });
});

it('recognizes quotation framing even for an unresolved source', () => {
  expect(
    assessClaimApplicability(
      input('قال تعالى: «نص مقتبس واضح».', [{ text: 'نص مقتبس واضح', role: 'unclassified' }]),
    ),
  ).toEqual({
    status: 'not_applicable',
    reason: 'quotation_only',
  });
});

it('does not hide declarative premises, unknown prose, or uncovered legacy text', () => {
  expect(assessClaimApplicability(input('لماذا الصلاة غير واجبة؟'))).toEqual({
    status: 'applicable',
    reason: 'assertion_present',
  });
  expect(assessClaimApplicability(input('ما معنى التوحيد؟ التوحيد أربعة أنواع.'))).toEqual({
    status: 'undetermined',
    reason: 'unclear_author_text',
  });
  expect(
    assessClaimApplicability(
      input('يقول الكاتب «نص مقتبس واضح» ثم يضيف كلاما آخر.', [
        { text: 'نص مقتبس واضح', role: 'ayah' },
      ]),
    ),
  ).toEqual({
    status: 'undetermined',
    reason: 'unclear_author_text',
  });
  expect(assessClaimApplicability({ originalText: 'نص', segments: [] })).toEqual({
    status: 'undetermined',
    reason: 'unclear_author_text',
  });
});

it('keeps old literal reports parseable while rejecting unsupported comparison values', () => {
  const old = {
    segmentId: 's',
    evidenceKey: null,
    status: 'unresolved',
    reason: 'old',
    matchedStart: null,
    matchedEnd: null,
  };
  expect(LiteralFindingSchema.parse(old)).toEqual(old);
  expect(
    LiteralFindingSchema.safeParse({
      ...old,
      comparison: {
        fidelity: 'correct',
        extent: 'full',
        differences: [],
        basis: 'canonical',
      },
    }).success,
  ).toBe(false);
});
