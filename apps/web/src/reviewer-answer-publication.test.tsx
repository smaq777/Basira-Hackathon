// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { initialEditorialReview } from '../../../packages/contracts/src/editorial-review.js';
import { ReviewerAnswerPublication } from './reviewer-answer-publication.js';
afterEach(cleanup);
it('enables a saved Quran-only answer and publishes only after preview confirmation', () => {
  const onPublish = vi.fn();
  const source = {
    id: 'q1',
    work: 'القرآن الكريم',
    author: '',
    edition: '',
    reference: '2:271',
    sourceUrl: 'https://example.com/verified',
    originalText: 'نص محفوظ',
    context: '',
    sourceRole: 'quran_text' as const,
  };
  render(
    <ReviewerAnswerPublication
      available
      saving={false}
      onPublish={onPublish}
      response={{
        version: 3,
        text: 'الإجابة المحفوظة',
        editorial: { ...initialEditorialReview(null), evidence: [source] },
      }}
    />,
  );
  const button = screen.getByRole('button', { name: 'نشر الإجابة ومصادرها إلى RAG' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  expect(onPublish).not.toHaveBeenCalled();
  expect(screen.getByText('الإجابة المحفوظة')).not.toBeNull();
  expect(screen.getByRole('link').getAttribute('href')).toBe(source.sourceUrl);
  fireEvent.click(screen.getByRole('button', { name: 'تأكيد النشر إلى RAG' }));
  expect(onPublish).toHaveBeenCalledWith(3);
});
it('enables a saved reply without extra source-curation fields and explains the actual disabled states', () => {
  const props = { available: true, saving: false, onPublish: vi.fn() };
  const view = render(<ReviewerAnswerPublication {...props} />);
  const button = () =>
    screen.getByRole('button', { name: 'نشر الإجابة ومصادرها إلى RAG' }) as HTMLButtonElement;
  expect(button().disabled).toBe(true);
  view.rerender(<ReviewerAnswerPublication {...props} response={{ version: 1, text: 'Saved' }} />);
  expect(button().disabled).toBe(false);
  view.rerender(
    <ReviewerAnswerPublication
      {...props}
      available={false}
      response={{ version: 1, text: 'Saved' }}
    />,
  );
  expect(button().disabled).toBe(true);
  expect(screen.getByRole('status')).not.toBeNull();
  view.rerender(
    <ReviewerAnswerPublication {...props} saving response={{ version: 1, text: 'Saved' }} />,
  );
  expect(button().disabled).toBe(true);
});
