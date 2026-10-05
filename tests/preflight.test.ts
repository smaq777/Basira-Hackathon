import { describe, expect, it } from 'vitest';
import { buildDemoPreflight, PreflightInputSchema } from '../apps/api/src/preflight.js';

describe('local preflight demonstration', () => {
  it('classifies a Quran quotation independently from its fidelity warning', () => {
    const text =
      'قال تعالى: «وَإِن تُخْفُوهَا فَهُوَ خَيْرٌ لَكُمْ». وهذا يدل على أن إخفاء الصدقة هو الأفضل دائمًا.';
    const result = buildDemoPreflight({ text });

    expect(result).toMatchObject({ mode: 'local_demo', verification: false });
    expect(result.findings[0]).toMatchObject({
      contentType: 'quran',
      classificationBasis: 'fixture_match',
      issueCode: 'quotation_mismatch',
      severity: 'warning',
      evidence: { reference: 'البقرة: ٢٧١' },
    });
    expect(result.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentType: 'quran', classificationBasis: 'fixture_match' }),
      ]),
    );
    expect(text.slice(result.findings[0]?.startOffset, result.findings[0]?.endOffset)).toBe(
      result.findings[0]?.text,
    );
  });

  it('recognizes a matching hadith fixture without implying authenticity', () => {
    const result = buildDemoPreflight({
      text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات» [صحيح البخاري: 1].',
    });

    expect(result.findings[0]).toMatchObject({
      contentType: 'hadith_matn',
      classificationBasis: 'fixture_match',
      issueCode: null,
      severity: 'info',
    });
    expect(result.findings[0]?.message).toContain('ليس حكمًا شرعيًا');
    expect(result.annotations.map((annotation) => annotation.contentType)).toEqual([
      'isnad',
      'hadith_matn',
      'claimed_source',
    ]);
    expect(result.annotations.find((annotation) => annotation.contentType === 'isnad')?.text).toBe(
      'قال رسول الله ﷺ:',
    );
    expect(
      result.annotations.find((annotation) => annotation.contentType === 'claimed_source')?.text,
    ).toBe('[صحيح البخاري: 1]');
  });

  it('flags an altered hadith wording but does not label that as a grading', () => {
    const result = buildDemoPreflight({
      text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات والأهداف» [صحيح البخاري: 1].',
    });

    expect(result.findings[0]).toMatchObject({
      contentType: 'hadith_matn',
      issueCode: 'quotation_mismatch',
      severity: 'warning',
    });
  });

  it('keeps the claimed source semantically separate from whether it matches', () => {
    const result = buildDemoPreflight({
      text: 'قال تعالى: «وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ» [سورة أخرى: ١].',
    });

    expect(result.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: 'claimed_source',
          text: '[سورة أخرى: ١]',
          classificationBasis: 'pattern',
        }),
      ]),
    );
    expect(result.findings[0]).toMatchObject({
      contentType: 'quran',
      issueCode: 'attribution_mismatch',
      severity: 'warning',
    });
  });

  it('annotates an inline source without requiring square brackets', () => {
    const result = buildDemoPreflight({
      text: 'عن عمر بن الخطاب رضي الله عنه قال: قال رسول الله ﷺ: «إنما الأعمال بالنيات» صحيح البخاري: 1.',
    });

    expect(result.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentType: 'isnad' }),
        expect.objectContaining({ contentType: 'hadith_matn', text: 'إنما الأعمال بالنيات' }),
        expect.objectContaining({ contentType: 'claimed_source', text: 'صحيح البخاري: 1' }),
      ]),
    );
    expect(result.findings[0]).toMatchObject({ issueCode: null, severity: 'info' });
  });

  it('keeps scholarly attribution and insufficient evidence separate', () => {
    const result = buildDemoPreflight({
      text: 'قال الإمام: «هذه العبارة مثال يحتاج إلى مصدر محدد قبل نشره».',
    });

    expect(result.findings[0]).toMatchObject({
      contentType: 'scholarly_statement',
      classificationBasis: 'cue',
      issueCode: 'insufficient_evidence',
      severity: 'neutral',
      evidence: null,
    });
  });

  it('classifies broad inference separately from the quoted source type', () => {
    const result = buildDemoPreflight({
      text: 'وهذا يدل على أن إخفاء الصدقة هو الأفضل دائمًا، ولذلك يجب إخفاء كل صدقة.',
    });

    expect(result.findings[0]).toMatchObject({
      contentType: 'interpretation',
      issueCode: 'overgeneralization',
      severity: 'warning',
    });
  });

  it('classifies a late quotation independently of the five finding limit', () => {
    const text =
      'هذه مقدمة طويلة بلا نسبة إلى مصدر. '.repeat(70) +
      'قال تعالى: ﴿نص مثال عربي يحتاج إلى التحقق﴾.';
    const result = buildDemoPreflight({ text });
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(result.findings).toHaveLength(5);
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'quran',
        text: 'نص مثال عربي يحتاج إلى التحقق',
        classificationBasis: 'cue',
      }),
    );
    expect(result.warnings).toContain('candidate_limit_reached');
  });

  it('separates multiple quotations and attribution in one paragraph', () => {
    const text =
      'قال تعالى: «نص قرآني تجريبي يحتاج إلى تحقق» ثم قال رسول الله ﷺ: «نص حديث تجريبي يحتاج إلى تحقق» [صحيح البخاري: 99].';
    const result = buildDemoPreflight({ text });
    expect(
      result.annotations.filter((row) => ['quran', 'hadith_matn'].includes(row.contentType)),
    ).toEqual([
      expect.objectContaining({ contentType: 'quran', text: 'نص قرآني تجريبي يحتاج إلى تحقق' }),
      expect.objectContaining({
        contentType: 'hadith_matn',
        text: 'نص حديث تجريبي يحتاج إلى تحقق',
      }),
    ]);
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'isnad',
        text: 'قال رسول الله ﷺ:',
      }),
    );
  });

  it.each([
    ['﴿', '﴾'],
    ['{', '}'],
    ['(', ')'],
    ['“', '”'],
    ['"', '"'],
  ])('recognizes the framed %s %s wrapper without altering wording', (left, right) => {
    const text = `قال تعالى: ${left}نص مثال (3) مع تتمة محفوظة${right}.`;
    const result = buildDemoPreflight({ text });
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'quran',
        text: 'نص مثال (3) مع تتمة محفوظة',
      }),
    );
  });

  it('does not assign Quran or hadith identity to arbitrary parentheses or numeric notes', () => {
    const result = buildDemoPreflight({
      text: 'هذا شرح عادي (عبارة مؤلفة) مع حاشية (٣) ونقاش عن القرآن والحديث.',
    });
    expect(
      result.annotations.some((row) => ['quran', 'hadith_matn', 'isnad'].includes(row.contentType)),
    ).toBe(false);
  });

  it.each(['لم يقل النبي', 'ليس قول النبي', 'لا قال تعالى'])(
    'does not affirm denied attribution: %s',
    (prefix) => {
      const result = buildDemoPreflight({ text: `${prefix}: «نص مثال عربي غير منسوب».` });
      expect(
        result.annotations.some((row) =>
          ['quran', 'hadith_matn', 'isnad'].includes(row.contentType),
        ),
      ).toBe(false);
    },
  );

  it('preserves leading whitespace, emoji, and exact UTF-16 spans', () => {
    const text =
      '  \n😀 مقدمة قصيرة.\nعن عمر قال: قال رسول الله ﷺ: «  نص مثال عربي محفوظ  » [صحيح البخاري: 99].  ';
    expect(PreflightInputSchema.parse({ text }).text).toBe(text);
    const result = buildDemoPreflight({ text });
    const matn = result.annotations.find((row) => row.contentType === 'hadith_matn');
    const isnad = result.annotations.find((row) => row.contentType === 'isnad');
    expect(matn?.text).toBe('نص مثال عربي محفوظ');
    expect(isnad?.text).toBe('عن عمر قال: قال رسول الله ﷺ:');
    for (const row of [...result.annotations, ...result.findings]) {
      expect(text.slice(row.startOffset, row.endOffset)).toBe(row.text);
    }
    expect(matn?.startOffset).toBe(text.indexOf('نص مثال'));
  });

  it('separates an unwrapped matn from its narrator attribution', () => {
    const text = 'عن راو تجريبي قال: قال رسول الله ﷺ: لا تحذف هذه العبارة التجريبية.';
    const result = buildDemoPreflight({ text });
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'hadith_matn',
        text: 'لا تحذف هذه العبارة التجريبية.',
      }),
    );
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'isnad',
        text: 'عن راو تجريبي قال: قال رسول الله ﷺ:',
      }),
    );
  });

  it('uses the nearest scholarly attribution instead of an earlier Quran cue', () => {
    const result = buildDemoPreflight({
      text: 'ذكر عبارة قال تعالى ثم قال الإمام: «نص مثال يحتاج إلى مصدر». ',
    });
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'scholarly_statement',
        text: 'نص مثال يحتاج إلى مصدر',
      }),
    );
  });

  it('recognizes the bounded prophetic prayer attribution', () => {
    const text = 'في الصحيحين قال - صلى الله عليه وسلم - لمعاذ: (نص حديث تجريبي واضح).';
    const result = buildDemoPreflight({ text });
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'hadith_matn',
        text: 'نص حديث تجريبي واضح',
      }),
    );
    expect(result.annotations).toContainEqual(expect.objectContaining({ contentType: 'isnad' }));
  });

  it('anchors a finding inside the quotation when its wording also occurs in the introduction', () => {
    const text = 'نص مثال عربي ثم قال تعالى: «نص مثال عربي». ';
    const result = buildDemoPreflight({ text });
    expect(result.findings[0]?.startOffset).toBe(text.lastIndexOf('نص مثال عربي'));
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        contentType: 'quran',
        startOffset: text.lastIndexOf('نص مثال عربي'),
      }),
    );
  });

  it('bounds structural annotations separately and discloses omitted annotation coverage', () => {
    const result = buildDemoPreflight({ text: 'قال تعالى: «نص مثال عربي». '.repeat(100) });
    expect(result.annotations).toHaveLength(80);
    expect(result.findings.length).toBeLessThanOrEqual(5);
    expect(result.warnings).toContain('annotation_limit_reached');
  });
});
