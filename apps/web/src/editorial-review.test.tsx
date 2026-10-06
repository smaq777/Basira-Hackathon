// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { EditorialReviewEditor, ReviewedReportContent } from './editorial-review.js';
import {
  initialEditorialReview,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';

const baseline: EditorialReview = {
  ...initialEditorialReview(null),
  summary: 'خلاصة آلية',
  limitations: 'حدود آلية',
  records: [
    {
      id: 'record-1',
      kind: 'quotation',
      status: 'unresolved',
      originalText: 'النص المرسل لا يتغير',
      correctedText: '',
      explanation: 'لم تحسم المطابقة',
      evidenceIds: ['source-1'],
    },
  ],
  evidence: [
    {
      id: 'source-1',
      work: 'مصدر تجريبي',
      author: 'مؤلف تجريبي',
      edition: 'طبعة أولى',
      reference: 'مرجع قديم',
      originalText: `نص المصدر كامل ${'ن'.repeat(200)}`,
      sourceUrl: 'https://example.com/source',
      context: 'سياق المصدر الكامل',
      sourceRole: 'book_excerpt',
    },
  ],
};
const reviewed: EditorialReview = {
  ...baseline,
  summary: 'خلاصة بشرية',
  suggestedText: 'نص معدل موثق',
  records: [
    {
      ...baseline.records[0]!,
      status: 'different',
      correctedText: 'التصحيح الموثق',
      explanation: 'شرح الاختلاف كاملا',
    },
  ],
  evidence: [{ ...baseline.evidence[0]!, reference: 'مرجع جديد', edition: 'طبعة ثانية' }],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('complete human report editing and lookup content', () => {
  it('edits every record field and removes evidence without leaving a resolved orphan', () => {
    let current = reviewed;
    function Editor() {
      const [value, setValue] = useState(reviewed);
      return (
        <EditorialReviewEditor
          value={value}
          onChange={(next) => {
            current = next;
            setValue(next);
          }}
        />
      );
    }
    render(<Editor />);
    fireEvent.change(screen.getByLabelText('حالة السجل'), { target: { value: 'matched' } });
    fireEvent.change(screen.getByLabelText('التصحيح أو التصنيف المعتمد'), {
      target: { value: 'تصحيح جديد' },
    });
    fireEvent.change(screen.getByLabelText('التعليل وحدود الدليل'), {
      target: { value: 'تعليل جديد' },
    });
    expect(current.records[0]).toMatchObject({
      status: 'matched',
      correctedText: 'تصحيح جديد',
      explanation: 'تعليل جديد',
    });
    fireEvent.click(screen.getByRole('button', { name: 'إزالة المصدر من هذه النسخة' }));
    expect(current.evidence).toHaveLength(0);
    expect(current.records[0]).toMatchObject({ status: 'unresolved', evidenceIds: [] });
    expect(baseline.records[0]!.originalText).toBe('النص المرسل لا يتغير');
    expect(screen.queryByRole('button', { name: 'حفظ كمسودة' })).toBeNull();
  });
  it('displays full original, evidence, metadata, before/after values and changed references', () => {
    render(
      <ReviewedReportContent
        review={reviewed}
        originalText="الأصل الكامل المحفوظ"
        baseline={baseline}
      />,
    );
    const content = document.body.textContent ?? '';
    for (const text of [
      'الأصل الكامل المحفوظ',
      baseline.evidence[0]!.originalText,
      'مؤلف تجريبي',
      'طبعة ثانية',
      'مرجع قديم',
      'مرجع جديد',
      'الأدلة: مرجع قديم',
      'الأدلة: مرجع جديد',
      'خلاصة آلية',
      'خلاصة بشرية',
      'شرح الاختلاف كاملا',
    ])
      expect(content).toContain(text);
    expect(screen.getAllByRole('link', { name: 'فتح المرجع' })[0]!.getAttribute('href')).toBe(
      'https://example.com/source',
    );
  });
  it('copies the complete reviewed suggestion and reports clipboard failure honestly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReviewedReportContent review={reviewed} originalText="الأصل" />);
    fireEvent.click(screen.getByRole('button', { name: 'نسخ النص المعدل' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('تم نسخ النص المعدل'));
    expect(writeText).toHaveBeenCalledWith(reviewed.suggestedText);
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'نسخ النص المعدل' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('تعذر النسخ التلقائي'),
    );
  });
  it('does not invent a suggestion or a copy button when none was published', () => {
    render(<ReviewedReportContent review={baseline} originalText="الأصل" />);
    expect(screen.queryByRole('button', { name: 'نسخ النص المعدل' })).toBeNull();
  });
});
