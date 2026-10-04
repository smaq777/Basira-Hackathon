import { describe, expect, it } from 'vitest';
import { buildDemoPreflight } from '../apps/api/src/preflight.js';

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
});
