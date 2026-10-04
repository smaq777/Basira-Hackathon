// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FoundationReportContent } from './foundation-report.js';
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
    expect(screen.getByText('لم يُقيّم الاستدلال')).not.toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /عرض النص المرجعي كاملًا/ }));
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
    expect(view.container.querySelector('details')).toBeNull();
  });

  it('uses human Quran citations and only the curated reading destination', () => {
    const report = foundationReportFixture();
    const source = report.intake.evidence[0]!;
    source.sourceRole = 'quran_text';
    source.reference = '39:38';
    source.work = 'Quran';
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
        ruleId: 'literal-mismatch',
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
    expect(screen.getByText('اقرأ السياق الكامل قبل الاستناد إلى هذا النقل.')).not.toBeNull();
    expect(
      screen.getByText(
        'يعرض التقرير مقارنة النقل بالمصادر المتاحة؛ كفاية الاستدلال تُقيّم بصورة مستقلة.',
      ),
    ).not.toBeNull();
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
    expect(screen.getByText('لم يُقيّم الاستدلال')).not.toBeNull();
    expect(screen.queryByText('لا يوجد استنتاج قابل للتقييم في هذا النص')).toBeNull();
    expect(screen.queryByText('يحتاج تأكيدًا بشريًا')).toBeNull();
  });
});
