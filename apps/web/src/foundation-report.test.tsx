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
    expect(screen.getByText('مقتطف من المصدر؛ لا يمثل النص الكامل.')).not.toBeNull();
    expect(screen.getByText('لم يُقيّم الاستدلال')).not.toBeNull();
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(screen.getByText(`بداية ${SYNTHETIC_QUOTE} نهاية`)).not.toBeNull();
    expect(screen.getByText('نسخة اختبار')).not.toBeNull();
    expect(screen.getByText(/synthetic; not a religious source/)).not.toBeNull();
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
    expect(screen.getByText('مقتطف من المصدر؛ لا يمثل النص الكامل.')).not.toBeNull();
    expect(screen.getByText(/exact_contiguous_excerpt/).closest('details')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /عرض المصدر الكامل/ }));
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
      expect(screen.getByText('تطابق بعد التطبيع؛ ليس تطابقًا حرفيًا')).not.toBeNull();
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
});
