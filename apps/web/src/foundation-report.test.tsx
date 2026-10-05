// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoundationReportContent } from './foundation-report.js';
import type { QuotationComparison } from '../../../packages/contracts/src/foundation.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from '../../../packages/contracts/src/semantic-assessment.js';
import {
  comparisonHighlights,
  editorialNotes,
  interpretationPresentation,
  reportFindings,
  retrievalLimitation,
} from './foundation-report-presentation.js';
import {
  foundationReportFixture,
  ORIGINAL_TEXT,
  SYNTHETIC_QUOTE,
} from './foundation-report.fixtures.js';

afterEach(cleanup);

describe('foundation report presentation', () => {
  it('separates exact excerpt accuracy, its extent and unassessed inference', () => {
    const report = foundationReportFixture();
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
    expect(screen.getByText('مقتطف متصل من المصدر؛ لا يشمل النص الكامل.')).not.toBeNull();
    expect(screen.getByText('لم يُجرَ تقييم الاستدلال في هذا التقرير')).not.toBeNull();
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(screen.getByText(`بداية ${SYNTHETIC_QUOTE} نهاية`)).not.toBeNull();
    expect(screen.queryByText(/نسخة اختبار/)).toBeNull();
    expect(screen.queryByText(/synthetic; not a religious source/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'نسخ النص كاملًا' })).toBeNull();
  });

  it('never labels normalized, partial, mismatched or invalid exact comparisons accurate', () => {
    for (const status of ['normalized', 'partial', 'mismatch', 'unresolved', 'exact'] as const) {
      const report = foundationReportFixture();
      report.intake.quotationFindings[0]!.status = status;
      if (status === 'exact') report.intake.quotationFindings[0]!.matchedStart = 0;
      const view = render(<FoundationReportContent report={report} />);
      expect(screen.queryByText('نقل مطابق حرفيًا')).toBeNull();
      view.unmount();
    }
  });

  it('separates legacy exact-contiguous-excerpt fidelity from partial extent using the verified original substring', () => {
    const report = foundationReportFixture();
    report.intake.quotationFindings[0]!.status = 'partial';
    report.intake.quotationFindings[0]!.reason =
      'exact_contiguous_excerpt;possible_omission;negation_token_changed';
    window.location.hash = '#/result?reviewId=owned';
    Element.prototype.scrollIntoView = () => undefined;
    const view = render(<FoundationReportContent report={report} />);
    expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
    expect(screen.getByText('مقتطف متصل من المصدر؛ لا يشمل النص الكامل.')).not.toBeNull();
    expect(screen.queryByText(/exact_contiguous_excerpt/)).toBeNull();
    fireEvent.click(screen.getByText(/^النص المرجعي كاملًا:/));
    expect(window.location.hash).toBe('#/result?reviewId=owned');
    view.unmount();
    report.intake.quotationFindings[0]!.matchedStart = 0;
    render(<FoundationReportContent report={report} />);
    expect(screen.queryByText('نقل مطابق حرفيًا')).toBeNull();
  });

  it('does not infer fidelity from a later reason code or typographic normalization', () => {
    for (const reason of [
      'normalized_contiguous_excerpt;typographic_variation',
      'possible_omission;exact_contiguous_excerpt',
    ]) {
      const report = foundationReportFixture();
      report.intake.quotationFindings[0]!.status = 'partial';
      report.intake.quotationFindings[0]!.reason = reason;
      const view = render(<FoundationReportContent report={report} />);
      expect(screen.queryByText('نقل مطابق حرفيًا')).toBeNull();
      view.unmount();
    }
  });

  it('shows a raw full-source match as exact when the comparator omits excerpt offsets', () => {
    const report = foundationReportFixture();
    report.intake.evidence[0]!.originalText = SYNTHETIC_QUOTE;
    report.intake.quotationFindings[0]!.matchedStart = null;
    report.intake.quotationFindings[0]!.matchedEnd = null;
    report.intake.quotationFindings[0]!.reason = 'raw_full_match';
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
    expect(screen.getByText('النص المرجعي كاملًا.')).not.toBeNull();
  });

  it('labels canonical and declared typographic excerpt matches separately from literal accuracy', () => {
    for (const reason of [
      'canonically_equivalent_contiguous_excerpt',
      'contiguous_excerpt_under_declared_typography_rules',
    ]) {
      const report = foundationReportFixture();
      report.intake.quotationFindings[0]!.status = 'partial';
      report.intake.quotationFindings[0]!.reason = reason;
      const view = render(<FoundationReportContent report={report} />);
      expect(screen.getByText('نقل مطابق مع اختلاف في الرسم أو الضبط')).not.toBeNull();
      expect(screen.queryByText('نقل مطابق حرفيًا')).toBeNull();
      view.unmount();
    }
  });

  it('renders untrusted source content as text and does not create unsafe external links', () => {
    const report = foundationReportFixture();
    report.intake.evidence[0]!.originalText = '<img src=x onerror=alert(1)>';
    report.intake.evidence[0]!.sourceUrl = 'javascript:alert(1)';
    render(<FoundationReportContent report={report} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'فتح رابط المصدر' })).toBeNull();
  });

  it('hides technical source and review metadata even when old report warnings include it', () => {
    const report = foundationReportFixture();
    report.intake.evidence[0]!.snapshotKey = 'private-snapshot-11666';
    report.intake.evidence[0]!.sourceVersion = 'version-hash-opaque';
    report.intake.evidence[0]!.edition =
      'supplied digital package v3.0; printed edition unspecified';
    report.intake.evidence[0]!.provenance = {
      internal_id: 11666,
      original_raw_text: 'PRIVATE TRACE',
    };
    report.intake.warnings.push('MCP schema private-diagnostics');
    report.limitations.push('Approval pending private-policy');
    report.themes.limitations.push('uncalibrated detector-private');
    const view = render(<FoundationReportContent report={report} />);
    for (const secret of [
      report.reviewId,
      report.revisionId,
      report.inputSha256,
      report.evidenceStateSha256,
      report.pipelineVersion,
      report.intake.corpusVersion,
      report.themes.detectorVersion,
      'private-snapshot-11666',
      'version-hash-opaque',
      'supplied digital package v3.0',
      'internal_id',
      'PRIVATE TRACE',
      'private-diagnostics',
      'private-policy',
      'detector-private',
      'SHA-256',
      'غير معتمد للاستخدام العلمي',
      'مصادر قيد الاعتماد',
      'بيانات التتبع',
    ])
      expect(view.container.innerHTML).not.toContain(secret);
    expect(view.container.querySelector('.foundation-provenance')).toBeNull();
  });

  it('uses human Quran citations and only the curated reading destination', () => {
    const report = foundationReportFixture();
    const source = report.intake.evidence[0]!;
    source.sourceRole = 'quran_text';
    source.reference = '39:38';
    source.work = 'Quran';
    source.provenance = { surah_name_original: 'الزمر' };
    source.sourceUrl = 'https://tanzil.net/pub/download/index.php?quranType=uthmani';
    render(<FoundationReportContent report={report} />);
    expect(
      screen.getByRole('heading', { name: 'القرآن الكريم — سورة الزمر، الآية 38' }),
    ).not.toBeNull();
    const reader = screen.getByRole('link', { name: 'قراءة الآية على Quran.com' });
    expect(reader.getAttribute('href')).toBe('https://quran.com/39/38');
    expect(document.body.innerHTML).not.toContain(source.sourceUrl);
    expect(screen.getByText(`بداية ${SYNTHETIC_QUOTE} نهاية`)).not.toBeNull();
    expect(screen.queryByText('39:38')).toBeNull();
  });

  it('presents an editorial context reminder without resurfacing edition approval metadata', () => {
    const report = foundationReportFixture();
    const quote = report.intake.segments[0]!;
    report.intake.evidence[0]!.edition = 'Tanzil Quran Text Uthmani Version 1.1';
    report.improvementCards = [
      {
        id: 'test-card',
        ruleId: 'normative-source-gap',
        title: 'راجع النقل',
        explanation: 'قارن العبارة بالنص المرجعي.',
        limitation: 'لم تُعتمد الطبعات علميًا',
        trigger: {
          segmentId: quote.id,
          startOffset: quote.startOffset,
          endOffset: quote.endOffset,
          originalText: quote.originalText,
          mentionStatus: 'assertive',
          normative: false,
        },
        evidenceKeys: ['source'],
        relatedContextOnly: true,
        suggestedDraft: null,
      },
    ];
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('اقرأ المصدر كاملًا قبل الاستناد إليه.')).not.toBeNull();
    expect(screen.getByText('مؤشر كفاية الاستدلال')).not.toBeNull();
    expect(screen.queryByText('لم تُعتمد الطبعات علميًا')).toBeNull();
    expect(document.body.textContent).not.toContain('Tanzil Quran Text Uthmani Version');
  });

  it('shows a real work title without manufacturing a canonical hadith number', () => {
    const report = foundationReportFixture();
    const source = report.intake.evidence[0]!;
    source.reference = 'book=2.0/internal_id=11666';
    source.work = 'صحيح مسلم - كتاب الإيمان';
    source.sourceUrl = 'https://github.com/example/research/blob/main/hadith.json';
    render(<FoundationReportContent report={report} />);
    expect(screen.getByRole('heading', { name: source.work })).not.toBeNull();
    expect(screen.getByText('لم يثبت رقم الحديث في طبعة محددة ضمن هذا التقرير.')).not.toBeNull();
    expect(document.body.innerHTML).not.toContain('11666');
    expect(document.body.innerHTML).not.toContain('book=2');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps download, raw data, MCP and arbitrary external URLs out of the report', () => {
    for (const url of [
      'https://mcp.tafsir.net/mcp',
      'https://example.com/download/source.zip',
      'https://raw.githubusercontent.com/example/repo/main/data.json',
      'https://quran.com.evil.example/39/38',
      'https://quran.com/39/38',
    ]) {
      const report = foundationReportFixture();
      report.intake.evidence[0]!.sourceUrl = url;
      const view = render(<FoundationReportContent report={report} />);
      expect(screen.queryByRole('link')).toBeNull();
      expect(view.container.innerHTML).not.toContain(url);
      view.unmount();
    }
  });

  it('renders structured wording changes and internal gaps separately from accurate excerpts', () => {
    const report = foundationReportFixture();
    report.intake.quotationFindings[0]!.comparison = {
      fidelity: 'different',
      extent: 'gapped',
      basis: 'canonical',
      differences: [
        { kind: 'replace', quotedText: 'وإن', sourceText: 'ولئن' },
        { kind: 'omit', quotedText: '', sourceText: 'والأرض' },
      ],
    };
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('اختلاف في ألفاظ النقل')).not.toBeNull();
    expect(screen.getByText('يتضمن النقل حذفًا داخل موضعه في المصدر.')).not.toBeNull();
    expect(screen.getByText('ورد في النقل: «وإن»؛ وفي المصدر: «ولئن».')).not.toBeNull();
    expect(screen.getByText('ورد في المصدر ولم يرد في النقل: «والأرض».')).not.toBeNull();
    expect(screen.queryByText('نقل مطابق حرفيًا')).toBeNull();
    expect(screen.queryByText('لم يثبت اكتمال النقل.')).toBeNull();
  });

  it('describes unresolved alignment without making source completeness a failure', () => {
    const report = foundationReportFixture();
    report.intake.quotationFindings[0]!.status = 'unresolved';
    report.intake.quotationFindings[0]!.matchedStart = null;
    report.intake.quotationFindings[0]!.matchedEnd = null;
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('لم تُحسم مطابقة النقل')).not.toBeNull();
    expect(screen.getByText('لم يتحدد موضع المقتطف وحدوده في المصدر.')).not.toBeNull();
    expect(screen.queryByText('لم يثبت اكتمال النقل.')).toBeNull();
  });

  it('distinguishes question with quotations from a substantive authored claim in old reports', () => {
    const report = foundationReportFixture();
    report.intake.originalText = `ما معنى التوحيد وأنواعه الثلاثة؟ قال تعالى: «${SYNTHETIC_QUOTE}»`;
    const quote = report.intake.segments[0]!;
    quote.startOffset = report.intake.originalText.indexOf(SYNTHETIC_QUOTE);
    quote.endOffset = quote.startOffset + SYNTHETIC_QUOTE.length;
    report.interpretation.status = 'needs_confirmation';
    const view = render(<FoundationReportContent report={report} />);
    expect(screen.getByText('لا يوجد استنتاج قابل للتقييم في هذا النص')).not.toBeNull();
    expect(screen.queryByText('يحتاج تأكيدًا بشريًا')).toBeNull();
    view.unmount();
    report.intake.originalText = `التوحيد ثلاثة أنواع؛ والدليل هو «${SYNTHETIC_QUOTE}»`;
    quote.startOffset = report.intake.originalText.indexOf(SYNTHETIC_QUOTE);
    quote.endOffset = quote.startOffset + SYNTHETIC_QUOTE.length;
    render(<FoundationReportContent report={report} />);
    expect(screen.getByText('لم يُجرَ تقييم الاستدلال في هذا التقرير')).not.toBeNull();
    expect(screen.queryByText('لا يوجد استنتاج قابل للتقييم في هذا النص')).toBeNull();
    expect(screen.queryByText('يحتاج تأكيدًا بشريًا')).toBeNull();
  });

  it('prioritizes word differences, uncertainty and faithful quotes without counting numeric markers', () => {
    const report = actionableFixture();
    render(<FoundationReportContent report={report} />);
    expect(screen.getByRole('button', { name: 'اختلافات النقل (1)' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'مطابقة غير محسومة (1)' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'نقل مطابق (1)' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /مقارنة النقل.*٣/ })).toBeNull();
    expect(screen.getAllByText('لم يُجرَ تقييم الاستدلال في هذا التقرير')).toHaveLength(1);
  });

  it('selects a draft quote and compares its source without highlighting authored paragraphs', () => {
    const report = actionableFixture();
    const view = render(<FoundationReportContent report={report} />);
    const original = screen.getByLabelText('النص الأصلي مع مواضع النقل');
    expect(original.textContent).toBe(report.intake.originalText);
    expect(original.querySelectorAll('mark')).toHaveLength(4);
    expect(view.container.querySelector('.foundation-highlight--author_text')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'مقارنة النقل 2: نقل غير محسوم' }));
    expect(screen.getByRole('region', { name: 'مقارنة النقل المحدد' }).textContent).toContain(
      'توجد عدة مصادر مرشحة',
    );
    expect(original.querySelector('.foundation-highlight--active')?.textContent).toBe(
      'نقل غير محسوم',
    );
    fireEvent.click(screen.getByRole('button', { name: 'إظهار مقارنة: نص تجريبي مطابق' }));
    expect(original.querySelector('.foundation-highlight--active')?.textContent).toBe(
      'نص تجريبي مطابق',
    );
  });

  it('collapses source text and distinguishes selected sources, candidates and optional topic context', () => {
    const view = render(<FoundationReportContent report={actionableFixture()} />);
    const library = view.container.querySelector(
      'details.foundation-library',
    ) as HTMLDetailsElement;
    expect(library.open).toBe(false);
    expect(view.container.querySelectorAll('.foundation-source > blockquote')).toHaveLength(0);
    fireEvent.click(screen.getByText('المصادر والسياقات (4)'));
    expect(library.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'مصادر المقارنة' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'مصادر مرشحة' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'قراءة إضافية مرتبطة بالموضوع' })).not.toBeNull();
    expect(
      screen.getByText('هذه قراءة إضافية؛ لم تُنقل في النص ولا تثبت الاستدلال.'),
    ).not.toBeNull();
  });

  it('uses Arabic surah names with marks and tries another stored name when the first is invalid', () => {
    const report = foundationReportFixture();
    const source = report.intake.evidence[0]!;
    source.sourceRole = 'quran_text';
    source.reference = '21:25';
    source.provenance = { surah_name: 'invalid 21 metadata', surah_name_original: 'الأنبياء' };
    const view = render(<FoundationReportContent report={report} />);
    expect(
      screen.getByRole('heading', { name: 'القرآن الكريم — سورة الأنبياء، الآية 25' }),
    ).not.toBeNull();
    view.unmount();
    source.provenance = { surah_name: 'الأنبيَاء ' };
    render(<FoundationReportContent report={report} />);
    expect(
      screen.getByRole('heading', { name: 'القرآن الكريم — سورة الأنبيَاء، الآية 25' }),
    ).not.toBeNull();
  });
});

// Authored synthetic text only; never copy the private evaluation submission here.
function actionableFixture() {
  const report = foundationReportFixture();
  const phrases = ['نقل مختلف هنا', 'نقل غير محسوم', 'نص تجريبي مطابق', '٣'];
  report.intake.originalText = `مقدمة اختبار تبقى بلا تلوين.\n«${phrases[0]}» و«${phrases[1]}»\nفقرة ثانية: «${phrases[2]}» (${phrases[3]})`;
  report.intake.segments = phrases.map((phrase, index) => ({
    ...report.intake.segments[0]!,
    id: `segment-${index}`,
    originalText: phrase,
    startOffset: report.intake.originalText.indexOf(phrase),
    endOffset: report.intake.originalText.indexOf(phrase) + phrase.length,
    sourceKeys: index === 3 ? [] : index === 1 ? ['candidate', 'source'] : ['source'],
  }));
  report.intake.quotationFindings = report.intake.segments.map((segment, index) => ({
    segmentId: segment.id,
    evidenceKey: index === 1 || index === 3 ? null : 'source',
    status:
      index === 0
        ? ('mismatch' as const)
        : index === 2
          ? ('exact' as const)
          : ('unresolved' as const),
    reason: 'synthetic',
    matchedStart: null,
    matchedEnd: null,
    comparison: {
      fidelity:
        index === 0
          ? ('different' as const)
          : index === 2
            ? ('exact' as const)
            : ('unresolved' as const),
      extent: index === 2 ? ('excerpt' as const) : ('unknown' as const),
      basis: 'canonical' as const,
      differences:
        index === 0 ? [{ kind: 'replace' as const, quotedText: 'مختلف', sourceText: 'مطابق' }] : [],
    },
  }));
  const source = report.intake.evidence[0]!;
  source.originalText = 'نص تجريبي مطابق في مصدر الاختبار';
  report.intake.evidence = [
    source,
    {
      ...source,
      snapshotKey: 'candidate',
      work: 'مصدر مرشح للاختبار',
      originalText: 'نقل غير محسوم في سياق مختلف',
    },
    {
      ...source,
      snapshotKey: 'topic',
      sourceRole: 'quran_text',
      reference: '112:1',
      work: 'القرآن الكريم',
      provenance: { purpose: 'related_context_candidate', surah_name_original: 'الإخلاص' },
    },
    {
      ...source,
      snapshotKey: 'topic-tafsir',
      sourceRole: 'tafsir_commentary',
      reference: '112:1',
      work: 'تفسير للاختبار',
      parentSnapshotKey: 'topic',
      provenance: { purpose: 'source_context' },
    },
  ];
  return report;
}

it('explains a model outage while keeping source comparison available', () => {
  const report = foundationReportFixture();
  report.interpretation.status = 'unavailable';
  render(<FoundationReportContent report={report} />);
  expect(screen.getByText('تعذر استكمال التقييم الدلالي')).not.toBeNull();
  expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
  expect(screen.queryByText('لم يُجرَ تقييم الاستدلال في هذا التقرير')).toBeNull();
});

it('explains an unavailable claim extraction without implying that source evidence failed', () => {
  const report = semanticBindingFixture();
  report.interpretation.status = 'unavailable';
  report.semanticAssessment!.status = 'unavailable';
  report.semanticAssessment!.claims = [];
  report.semanticAssessment!.assessments = [];
  const view = render(<FoundationReportContent report={report} />);
  expect(screen.getByText('تعذر استكمال التقييم الدلالي')).not.toBeNull();
  expect(
    screen.getByText(
      'لم يتمكن التقييم من تحديد عبارات الكاتب وربطها بالنص والمصادر بصورة موثوقة. تظل نتائج مقارنة النقل والمصادر متاحة.',
    ),
  ).not.toBeNull();
  expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
  expect(view.container.textContent).not.toContain('invalid_claims');
  expect(screen.queryByText('لا يوجد استنتاج قابل للتقييم في هذا النص')).toBeNull();
});

it('distinguishes a valid empty selection from service failure without declaring the writing correct or claim-free', () => {
  const report = semanticBindingFixture();
  report.interpretation.status = 'unavailable';
  report.semanticAssessment!.status = 'partial';
  report.semanticAssessment!.errorCode = 'no_claims_extracted';
  report.semanticAssessment!.claims = [];
  report.semanticAssessment!.assessments = [];
  render(<FoundationReportContent report={report} />);
  expect(screen.getByText('لم يُحسم تحديد الادعاءات')).not.toBeNull();
  expect(screen.getByText(/قد توجد عبارات لم تُراجع/)).not.toBeNull();
  expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
  expect(screen.queryByText('تعذر استكمال التقييم الدلالي')).toBeNull();
  expect(screen.queryByText('لا يوجد استنتاج قابل للتقييم في هذا النص')).toBeNull();
});

it('preserves partial assessments and explains that unverifiable proposed statements were skipped', () => {
  const report = semanticBindingFixture();
  const view = render(<FoundationReportContent report={report} />);
  expect(screen.getByText('تقييم دلالي أولي')).not.toBeNull();
  expect(
    screen.getByText(
      'تتوفر نتائج أولية لبعض العبارات. تعذر التحقق من بعض العبارات المقترحة أو ربطها بالنص والمصادر، فاستُبعدت من التقييم. النتائج المعروضة مقترحات للمراجعة.',
    ),
  ).not.toBeNull();
  expect(screen.getByText('هذه نتيجة أولية لعبارة الاختبار.')).not.toBeNull();
  expect(screen.getByText('نقل مطابق حرفيًا')).not.toBeNull();
  expect(view.container.textContent).not.toContain('invalid_claims');
  expect(view.container.textContent).not.toContain(SEMANTIC_PROMPT_VERSION);
  expect(screen.queryByText('تعذر استكمال التقييم الدلالي')).toBeNull();
});

function semanticBindingFixture() {
  const report = foundationReportFixture();
  const originalText = 'كلامًا يحتاج إلى مراجعة';
  const startOffset = report.intake.originalText.indexOf(originalText);
  report.interpretation.status = 'provisional';
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'partial',
    provisional: true,
    scholarlyApproval: false,
    errorCode: 'invalid_claims',
    claims: [
      {
        id: 'claim-' + 'a'.repeat(24),
        segmentId: 'author',
        originalText,
        startOffset,
        endOffset: startOffset + originalText.length,
        provisional: true,
        evidenceKeys: ['source'],
      },
    ],
    assessments: [
      {
        claimId: 'claim-' + 'a'.repeat(24),
        status: 'not_established',
        conditions: [],
        negations: [],
        exceptions: [],
        scope: [],
        citations: [],
        explanation: 'هذه نتيجة أولية لعبارة الاختبار.',
      },
    ],
    trace: {
      pipelineVersion: SEMANTIC_PIPELINE_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
      inputSha256: report.inputSha256,
      evidenceSha256: 'd'.repeat(64),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
    limitations: [],
  };
  return report;
}

it('shows provisional semantic findings with readable sources and no model trace', () => {
  const report = foundationReportFixture();
  report.interpretation.status = 'provisional';
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'completed',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    claims: [
      {
        id: 'claim-' + 'a'.repeat(24),
        segmentId: 'author',
        originalText: 'عبارة الكاتب التجريبية',
        startOffset: 0,
        endOffset: 22,
        provisional: true,
        evidenceKeys: ['source'],
      },
    ],
    assessments: [
      {
        claimId: 'claim-' + 'a'.repeat(24),
        status: 'not_established',
        conditions: ['شرط تجريبي'],
        negations: [],
        exceptions: [],
        scope: [],
        explanation: 'الدليل المعروض لا يثبت هذا التعميم.',
        citations: [{ evidenceKey: 'source', excerpt: SYNTHETIC_QUOTE }],
      },
    ],
    trace: {
      pipelineVersion: 'provisional-semantic-v1.1',
      promptVersion: 'evidence-support-v1.1',
      inputSha256: report.inputSha256,
      evidenceSha256: 'd'.repeat(64),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
    limitations: [],
  };
  render(<FoundationReportContent report={report} />);
  expect(screen.getByText('تقييم دلالي أولي')).not.toBeNull();
  expect(screen.getByText('الدليل المعروض لا يثبت هذا التعميم.')).not.toBeNull();
  expect(screen.getByText('شرط تجريبي')).not.toBeNull();
  expect(screen.queryByText('evidence-support-v1.1')).toBeNull();
});

describe('readable report comparison refinements', () => {
  it('labels a standalone long source preview as clipped and preserves full reading text', () => {
    const report = foundationReportFixture();
    const text = 'ب'.repeat(399) + '😀' + 'خ'.repeat(400);
    report.intake.evidence.push({
      ...report.intake.evidence[0]!,
      snapshotKey: 'standalone',
      work: 'مصدر طويل للاختبار',
      reference: 'مصدر طويل للاختبار',
      originalText: text,
    });
    render(<FoundationReportContent report={report} />);
    fireEvent.click(screen.getByText('المصادر والسياقات (2)'));
    fireEvent.click(screen.getByRole('button', { name: /مصدر طويل للاختبار/ }));
    const comparison = screen.getByRole('region', { name: 'مقارنة النقل المحدد' });
    expect(comparison.querySelector('.foundation-compare-caption')?.textContent).toBe(
      'بداية النص المرجعي؛ موضع المقتطف غير محدد',
    );
    expect(comparison.querySelector('blockquote')?.textContent).toBe('ب'.repeat(399) + '…');
    expect(comparison.querySelector('.foundation-full-source blockquote')?.textContent).toBe(text);
  });

  it('does not carry the bound source verdict or differences into a selected candidate source', () => {
    const report = differenceFixture('نص جديد', 'نص قديم', [
      { kind: 'replace', quotedText: 'جديد', sourceText: 'قديم' },
    ]);
    report.intake.segments[0]!.sourceKeys.push('candidate');
    report.intake.evidence.push({
      ...report.intake.evidence[0]!,
      snapshotKey: 'candidate',
      work: 'مصدر بديل للاختبار',
      reference: 'مصدر بديل للاختبار',
      originalText: 'عبارة المصدر المرشح المختلف',
    });
    const view = render(<FoundationReportContent report={report} />);
    const comparison = screen.getByRole('region', { name: 'مقارنة النقل المحدد' });
    expect(comparison.textContent).toContain('اختلاف في ألفاظ النقل');
    expect(comparison.querySelector('.foundation-differences')).not.toBeNull();
    fireEvent.click(screen.getByText('المصادر والسياقات (2)'));
    fireEvent.click(screen.getByRole('button', { name: /مصدر بديل للاختبار/ }));
    expect(comparison.textContent).toContain('مصدر مرشح لم تثبت مطابقته');
    expect(comparison.textContent).not.toContain('اختلاف في ألفاظ النقل');
    expect(comparison.textContent).not.toContain(
      'توجد ألفاظ مختلفة أو محذوفة أو مضافة داخل النقل.',
    );
    expect(comparison.textContent).not.toContain('حدود المقتطف');
    expect(comparison.textContent).not.toContain('يتضمن النقل حذفًا داخل موضعه في المصدر.');
    expect(comparison.querySelector('.foundation-differences')).toBeNull();
    expect(comparison.querySelector('.foundation-word-difference')).toBeNull();
    expect(comparison.querySelector('.foundation-compare-card--different')).toBeNull();
    expect(
      comparison.querySelector('.foundation-compare-card--draft blockquote')?.textContent,
    ).toBe('نص جديد');
    expect(
      comparison.querySelector('.foundation-compare-card--reference blockquote')?.textContent,
    ).toBe('عبارة المصدر المرشح المختلف');
    expect(view.container.querySelector('.foundation-highlight--active')?.textContent).toBe(
      'نص جديد',
    );
    fireEvent.click(screen.getByRole('button', { name: 'إظهار مقارنة: نص جديد' }));
    expect(comparison.textContent).toContain('اختلاف في ألفاظ النقل');
    expect(comparison.querySelectorAll('.foundation-word-difference')).toHaveLength(2);
  });

  it('uses a green reference card and reserves the red draft card for actual word differences', () => {
    const view = render(<FoundationReportContent report={foundationReportFixture()} />);
    expect(view.container.querySelector('.foundation-compare-card--reference')).not.toBeNull();
    expect(view.container.querySelector('.foundation-compare-card--different')).toBeNull();
    expect(view.container.querySelectorAll('.foundation-word-difference')).toHaveLength(0);
    view.unmount();
    const report = differenceFixture('نص جديد', 'نص قديم', [
      { kind: 'replace', quotedText: 'جديد', sourceText: 'قديم' },
    ]);
    const differing = render(<FoundationReportContent report={report} />);
    expect(differing.container.querySelector('.foundation-compare-card--different')).not.toBeNull();
    expect(
      differing.container.querySelector('.foundation-compare-card--draft blockquote')?.textContent,
    ).toBe('نص جديد');
    expect(
      differing.container.querySelector('.foundation-compare-card--reference blockquote')
        ?.textContent,
    ).toBe('نص قديم');
    expect(
      [...differing.container.querySelectorAll('.foundation-word-difference')].map(
        (row) => row.textContent,
      ),
    ).toEqual(['جديد', 'قديم']);
  });

  it('maps omissions to the reference excerpt with full-source UTF16 offsets and leaves draft words intact', () => {
    const prefix = '😀 مقدمة طويلة: ';
    const reference = 'أول كلمة محذوفة آخر';
    const report = differenceFixture(
      'أول آخر',
      prefix + reference + ' خاتمة',
      [{ kind: 'omit', quotedText: '', sourceText: 'كلمة محذوفة' }],
      prefix.length,
      prefix.length + reference.length,
    );
    const row = reportFindings(report)[0]!;
    const highlights = comparisonHighlights(report, row, row.source);
    expect(highlights.draft).toEqual([]);
    expect(highlights.source).toEqual([{ startOffset: 4, endOffset: 15, kind: 'omit' }]);
    const view = render(<FoundationReportContent report={report} />);
    expect(
      view.container.querySelector('.foundation-compare-card--draft blockquote')?.textContent,
    ).toBe('أول آخر');
    expect(
      view.container.querySelector('.foundation-compare-card--reference blockquote')?.textContent,
    ).toBe(reference);
    expect(view.container.querySelector('.foundation-word-difference--omit')?.textContent).toBe(
      'كلمة محذوفة',
    );
  });

  it('highlights a unique insertion only in the draft and never injects markup from a source', () => {
    const report = differenceFixture('أول <img> آخر', 'أول آخر', [
      { kind: 'insert', quotedText: '<img>', sourceText: '' },
    ]);
    const view = render(<FoundationReportContent report={report} />);
    expect(view.container.querySelector('img')).toBeNull();
    expect(
      view.container.querySelector('.foundation-compare-card--draft .foundation-word-difference')
        ?.textContent,
    ).toBe('<img>');
    expect(
      view.container.querySelector(
        '.foundation-compare-card--reference .foundation-word-difference',
      ),
    ).toBeNull();
  });

  it('keeps explicit difference text without guessing a repeated or noncanonical occurrence', () => {
    for (const [draft, source, quotedText, sourceText] of [
      ['جديد جديد', 'قديم', 'جديد', 'قديم'],
      ['جديد', 'قديم قديم', 'جديد', 'قديم'],
      ['جديد', 'قَدِيم', 'جديد', 'قديم'],
    ]) {
      const report = differenceFixture(draft!, source!, [
        { kind: 'replace', quotedText: quotedText!, sourceText: sourceText! },
      ]);
      const view = render(<FoundationReportContent report={report} />);
      expect(view.container.querySelectorAll('.foundation-word-difference')).toHaveLength(0);
      expect(screen.getByLabelText('فروق النقل عن المصدر').textContent).toContain(sourceText);
      view.unmount();
    }
  });

  it('validates surrogate boundaries, detached draft spans and overlapping difference ranges', () => {
    const report = differenceFixture('😀 لفظ', '😀 كلمة', [
      { kind: 'replace', quotedText: 'لفظ', sourceText: 'كلمة' },
    ]);
    let row = reportFindings(report)[0]!;
    expect(comparisonHighlights(report, row, row.source).draft[0]?.startOffset).toBe(3);
    report.intake.quotationFindings[0]!.matchedStart = 1; // Inside the emoji surrogate pair.
    row = reportFindings(report)[0]!;
    expect(comparisonHighlights(report, row, row.source)).toEqual({ draft: [], source: [] });
    report.intake.quotationFindings[0]!.matchedStart = 0;
    report.intake.segments[0]!.startOffset += 1;
    row = reportFindings(report)[0]!;
    expect(comparisonHighlights(report, row, row.source)).toEqual({ draft: [], source: [] });
    report.intake.segments[0]!.startOffset -= 1;
    report.intake.quotationFindings[0]!.comparison!.differences.push({
      kind: 'replace',
      quotedText: 'لفظ',
      sourceText: 'كلمة',
    });
    row = reportFindings(report)[0]!;
    expect(comparisonHighlights(report, row, row.source)).toEqual({ draft: [], source: [] });
  });

  it('keeps a whole emoji difference intact and does not highlight a candidate source', () => {
    const report = differenceFixture('أول 😀 آخر', 'أول 😃 آخر', [
      { kind: 'replace', quotedText: '😀', sourceText: '😃' },
    ]);
    const row = reportFindings(report)[0]!;
    expect(comparisonHighlights(report, row, row.source)).toEqual({
      draft: [{ startOffset: 4, endOffset: 6, kind: 'replace' }],
      source: [{ startOffset: 4, endOffset: 6, kind: 'replace' }],
    });
    expect(comparisonHighlights(report, row, { ...row.source!, snapshotKey: 'candidate' })).toEqual(
      { draft: [], source: [] },
    );
  });

  it('shows a footer legend using the mainpage content-type classes and keeps author prose uncolored', () => {
    const report = actionableFixture();
    report.intake.segments[0]!.role = 'ayah';
    report.intake.segments[1]!.role = 'isnad';
    report.intake.segments[3]!.role = 'claimed_source';
    const view = render(<FoundationReportContent report={report} />);
    const original = screen.getByLabelText('النص الأصلي مع مواضع النقل');
    const legend = screen.getByLabelText('دليل ألوان أنواع العبارات');
    for (const className of ['quran', 'hadith_matn', 'isnad', 'claimed_source']) {
      expect(original.querySelector(`.semantic-highlight--${className}`)).not.toBeNull();
      expect(legend.querySelector(`.semantic-highlight--${className}`)).not.toBeNull();
    }
    expect(original.textContent).toBe(report.intake.originalText);
    expect(view.container.querySelector('.foundation-highlight--author_text')).toBeNull();
    const checkbox = screen.getByRole('checkbox', {
      name: 'إظهار أنواع العبارات المنقولة',
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(original.querySelectorAll('mark')).toHaveLength(1);
  });

  it('separates assessment not run from outage, no conclusion and provisional assessment', () => {
    const report = foundationReportFixture();
    expect(interpretationPresentation(report).label).toBe(
      'لم يُجرَ تقييم الاستدلال في هذا التقرير',
    );
    expect(interpretationPresentation(report).explanation).toContain('لم تُشغّل');
    report.interpretation.status = 'unavailable';
    expect(interpretationPresentation(report).label).toBe('تعذر استكمال التقييم الدلالي');
    report.interpretation.status = 'not_applicable';
    expect(interpretationPresentation(report).label).toBe(
      'لا يوجد استنتاج قابل للتقييم في هذا النص',
    );
    report.interpretation.status = 'provisional';
    expect(interpretationPresentation(report).label).toBe('تقييم دلالي أولي غير مكتمل');
  });
});

describe('consolidated editorial notes', () => {
  it('consolidates the same action across historical source/author identities while retaining both locations', () => {
    const report = editorialFixture();
    report.improvementCards[1]!.trigger.segmentId = 'old-source-segment';
    delete report.improvementCards[1]!.associationStatus;
    const notes = editorialNotes(report);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.occurrences).toHaveLength(2);
    expect(notes[0]!.evidenceKeys).toEqual(['source']);
  });

  it('bounds long context without splitting an emoji or losing the located keyword', () => {
    const report = editorialFixture();
    const text = 'ب'.repeat(121) + '😀' + ' التوحيد ' + 'ن'.repeat(500);
    report.intake.originalText = text;
    const startOffset = text.indexOf('التوحيد');
    report.improvementCards = [
      {
        ...report.improvementCards[0]!,
        trigger: {
          ...report.improvementCards[0]!.trigger,
          startOffset,
          endOffset: startOffset + 'التوحيد'.length,
        },
      },
    ];
    const context = editorialNotes(report)[0]!.occurrences[0]!.text;
    expect(context.length).toBeLessThanOrEqual(362);
    expect(context).toContain('التوحيد');
    expect(context.endsWith('…')).toBe(true);
    expect(context).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
  });

  it('groups repeated topic/template hints and shows each original context without claiming the source is absent', () => {
    const report = editorialFixture();
    const before = JSON.stringify(report);
    const notes = editorialNotes(report);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.occurrences.map((row) => row.text)).toEqual([
      'يجب بيان التوحيد بالدليل الأول.',
      'يجب شرح التوحيد بالدليل الثاني.',
    ]);
    const view = render(<FoundationReportContent report={report} />);
    const section = view.container.querySelector('.foundation-editorial-notes')!;
    expect(section.querySelectorAll('article')).toHaveLength(1);
    expect(section.textContent).toContain('راجع ربط هذه العبارات بمصادرها');
    expect(section.textContent).toContain('مواضع تحتاج مراجعة (2)');
    expect(section.textContent).toContain('بيّن أي مصدر تستند إليه كل عبارة');
    expect(section.textContent).not.toContain('دون مصدر');
    expect(section.textContent).not.toContain('العبارة الحكمية');
    expect(section.querySelectorAll('blockquote')).toHaveLength(2);
    expect(JSON.stringify(report)).toBe(before);
  });

  it('preserves different topics and different editorial actions instead of dropping notes by keyword', () => {
    const report = editorialFixture();
    report.improvementCards[1]!.associationStatus = 'unconfirmed_candidate';
    expect(editorialNotes(report)).toHaveLength(2);
    report.improvementCards[1]!.associationStatus = 'no_nearby_candidate';
    report.themes.authoredThemes[1] = {
      ...report.themes.authoredThemes[0]!,
      theme: 'prayer',
      anchors: [report.themes.authoredThemes[0]!.anchors[1]!],
    };
    report.themes.authoredThemes[0]!.anchors = [report.themes.authoredThemes[0]!.anchors[0]!];
    expect(editorialNotes(report)).toHaveLength(2);
    report.improvementCards[1]!.ruleId = 'charity-undetermined';
    const notes = editorialNotes(report);
    expect(notes).toHaveLength(2);
    expect(notes.some((note) => note.title === 'حدّد نوع الصدقة المقصود')).toBe(true);
  });

  it('deduplicates a shared sentence while keeping a different source gap action and raw untrusted text inert', () => {
    const report = editorialFixture();
    report.improvementCards[1] = { ...report.improvementCards[0]!, id: 'same-location' };
    expect(editorialNotes(report)[0]!.occurrences).toHaveLength(1);
    report.improvementCards[1]!.trigger = {
      ...report.improvementCards[1]!.trigger,
      originalText: '<img src=x onerror=alert(1)>',
      startOffset: 900,
      endOffset: 930,
    };
    const view = render(<FoundationReportContent report={report} />);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('scrolls and focuses the existing assessment while preserving the report route and partial coverage', () => {
    const report = editorialFixture();
    const semantic = semanticBindingFixture().semanticAssessment!;
    const text = 'يجب بيان التوحيد بالدليل الأول.';
    semantic.claims[0]!.originalText = text;
    semantic.claims[0]!.startOffset = 0;
    semantic.claims[0]!.endOffset = text.length;
    report.semanticAssessment = semantic;
    window.location.hash = '#/result?reviewId=owned';
    render(<FoundationReportContent report={report} />);
    const heading = screen.getByRole('heading', { name: 'مؤشر كفاية الاستدلال' });
    const scroll = vi.fn();
    heading.scrollIntoView = scroll;
    const focus = vi.spyOn(heading, 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'راجع نتائج كفاية الاستدلال' }));
    expect(window.location.hash).toBe('#/result?reviewId=owned');
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(heading);
    expect(editorialNotes(report)[0]!.occurrences.map((row) => row.hasAssessment)).toEqual([
      true,
      false,
    ]);
    expect(screen.queryByRole('link', { name: /التقييم|الاستدلال/ })).toBeNull();
    expect(screen.getByText('هذه نتيجة أولية لعبارة الاختبار.')).not.toBeNull();
    expect(screen.queryByText('دون مصدر')).toBeNull();
    focus.mockRestore();
  });
});

function editorialFixture() {
  const report = foundationReportFixture();
  report.intake.originalText = 'يجب بيان التوحيد بالدليل الأول.\nيجب شرح التوحيد بالدليل الثاني.';
  const first = report.intake.originalText.indexOf('التوحيد');
  const second = report.intake.originalText.lastIndexOf('التوحيد');
  const anchors = [first, second].map((startOffset) => ({
    segmentId: 'author',
    startOffset,
    endOffset: startOffset + 'التوحيد'.length,
    originalText: 'التوحيد',
    normative: true,
    mentionStatus: 'assertive' as const,
  }));
  report.themes.authoredThemes = [
    { theme: 'faith', anchors, mentionStatus: 'assertive', charitySubtype: null },
  ];
  report.improvementCards = anchors.map((trigger, index) => ({
    id: `editorial-${index}`,
    ruleId: 'normative-source-gap',
    title: 'راجع مصدر العبارة الحكمية',
    explanation: 'وردت عبارة حكمية دون مصدر قريب من موضوعها.',
    limitation: 'unapproved-digital-edition-private',
    trigger,
    evidenceKeys: ['source'],
    relatedContextOnly: true,
    associationStatus: 'no_nearby_candidate',
    suggestedDraft: null,
  }));
  return report;
}

function differenceFixture(
  draft: string,
  source: string,
  differences: QuotationComparison['differences'],
  matchedStart = 0,
  matchedEnd = source.length,
) {
  const report = foundationReportFixture();
  report.intake.originalText = `مقدمة 😀 «${draft}» خاتمة`;
  const segment = report.intake.segments[0]!;
  segment.originalText = draft;
  segment.startOffset = report.intake.originalText.indexOf(draft);
  segment.endOffset = segment.startOffset + draft.length;
  report.intake.evidence[0]!.originalText = source;
  const finding = report.intake.quotationFindings[0]!;
  finding.status = 'mismatch';
  finding.matchedStart = matchedStart;
  finding.matchedEnd = matchedEnd;
  finding.comparison = { fidelity: 'different', extent: 'gapped', basis: 'canonical', differences };
  return report;
}

it('shows limited retrieval separately from an unchanged semantic finding and hides diagnostic codes', () => {
  const report = semanticBindingFixture();
  report.semanticAssessment!.trace.retrieval = {
    corpusVersion: 'owned',
    mode: 'local_research',
    queries: [
      {
        claimId: report.semanticAssessment!.claims[0]!.id,
        querySha256: 'a'.repeat(64),
        modes: [],
        candidateKeys: [],
        selectedCandidateKeys: [],
        cache: {
          outcome: 'partial',
          elapsedMs: 1,
          parentCandidateCount: 0,
          failureCodes: ['embedding_unavailable'],
        },
      },
    ],
  };
  const before = report.semanticAssessment!.assessments[0]!.status;
  render(<FoundationReportContent report={report} />);
  expect(screen.getByRole('note').textContent).toBe(retrievalLimitation(report));
  expect(screen.queryByText(/embedding_unavailable/)).toBeNull();
  expect(report.semanticAssessment!.assessments[0]!.status).toBe(before);
});
it('does not describe a successful empty cache query as unavailable', () => {
  const report = semanticBindingFixture();
  report.semanticAssessment!.trace.retrieval = {
    corpusVersion: 'owned',
    mode: 'local_research',
    queries: [
      {
        claimId: report.semanticAssessment!.claims[0]!.id,
        querySha256: 'a'.repeat(64),
        modes: [],
        candidateKeys: [],
        selectedCandidateKeys: [],
        cache: { outcome: 'success', elapsedMs: 1, parentCandidateCount: 0, failureCodes: [] },
      },
    ],
  };
  expect(retrievalLimitation(report)).toBeNull();
});
