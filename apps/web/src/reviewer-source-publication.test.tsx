// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialEditorialReview,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';
import {
  eligibleReviewedSources,
  ReviewerSourceFields,
  reviewNotificationEmptyMessage,
} from './reviewer-source-publication.js';

const review: EditorialReview = {
  ...initialEditorialReview(null),
  evidence: [
    {
      id: 's1',
      work: 'كتاب تجريبي',
      author: 'مؤلف تجريبي',
      edition: 'طبعة اختبار',
      reference: 'باب 1',
      sourceUrl: 'https://example.com/source',
      originalText: 'نص مرجعي تجريبي',
      context: '',
      sourceRole: 'book_excerpt',
    },
  ],
  records: [
    {
      id: 'r1',
      kind: 'quotation',
      originalText: 'نص مرجعي تجريبي',
      status: 'matched',
      correctedText: '',
      explanation: 'مطابقة موثقة',
      evidenceIds: ['s1'],
    },
  ],
};
const props = {
  published: true,
  available: true,
  saving: false,
  sourceId: '',
  rights: '',
  onSourceChange: vi.fn(),
  onRightsChange: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('reviewed-source publication controls', () => {
  it('lists only resolved linked originals with complete provenance', () => {
    expect(eligibleReviewedSources(review)).toEqual(review.evidence);
    for (const status of ['unresolved', 'not_assessed', 'removed'] as const)
      expect(
        eligibleReviewedSources({ ...review, records: [{ ...review.records[0]!, status }] }),
      ).toEqual([]);
    expect(eligibleReviewedSources({ ...review, records: [] })).toEqual([]);
    expect(
      eligibleReviewedSources({ ...review, records: [{ ...review.records[0]!, evidenceIds: [] }] }),
    ).toEqual([]);
    for (const patch of [
      { author: '' },
      { edition: '' },
      { sourceUrl: '' },
      { reference: 'ر'.repeat(301) },
      { sourceRole: 'quran_text' as const },
      { sourceRole: 'tafsir_commentary' as const },
    ])
      expect(
        eligibleReviewedSources({ ...review, evidence: [{ ...review.evidence[0]!, ...patch }] }),
      ).toEqual([]);
  });
  it('explains a Quran-only empty menu instead of offering republishing', () => {
    render(
      <ReviewerSourceFields
        {...props}
        review={{ ...review, evidence: [{ ...review.evidence[0]!, sourceRole: 'quran_text' }] }}
      />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/القرآن والتفسير من المصادر المعتمدة/)).not.toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
  it('disables writes honestly when the server does not expose the publication capability', () => {
    render(<ReviewerSourceFields {...props} review={review} available={false} />);
    expect(screen.getByRole('status').textContent).toContain('لم يُضف شيء إلى RAG');
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
  });
  it('binds labelled full-width fields to the selected source and rights without publishing', () => {
    render(<ReviewerSourceFields {...props} review={review} />);
    fireEvent.change(screen.getByLabelText('الدليل من النسخة المنشورة'), {
      target: { value: 's1' },
    });
    fireEvent.change(screen.getByLabelText('حقوق الاستخدام والترخيص'), {
      target: { value: 'إذن تجريبي' },
    });
    expect(props.onSourceChange).toHaveBeenCalledWith('s1');
    expect(props.onRightsChange).toHaveBeenCalledWith('إذن تجريبي');
    expect(screen.getByRole('combobox').closest('label')?.className).toBe('note-field');
    expect(screen.getByRole('textbox').closest('label')?.className).toBe('note-field');
  });
  it('does not reuse an absent stale source or enable unpublished/busy inputs', () => {
    const view = render(
      <ReviewerSourceFields {...props} review={review} sourceId="stale" published={false} />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    view.rerender(<ReviewerSourceFields {...props} review={review} saving />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });
  it('distinguishes no consent from an opted-in ticket without an outbox entry', () => {
    expect(reviewNotificationEmptyMessage(false)).toContain('لم يفعّل');
    expect(reviewNotificationEmptyMessage(true)).toContain('لا يثبت إرسال رسالة');
  });
});
