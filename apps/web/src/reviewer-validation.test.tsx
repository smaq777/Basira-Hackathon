// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewerDetail } from './App.js';
import { getReviewerTicket, saveReviewerResponse } from './api.js';
import {
  initialEditorialReview,
  EditorialReviewSchema,
} from '../../../packages/contracts/src/editorial-review.js';
import { reviewPublicationValidationMessages } from './editorial-review.js';
vi.mock('./api.js', async (original) => ({
  ...(await original<typeof import('./api.js')>()),
  getReviewerTicket: vi.fn(),
  saveReviewerResponse: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const code = 'BR-205QA0000001';
async function showTicket() {
  vi.mocked(getReviewerTicket).mockResolvedValue({
    ticketCode: code,
    status: 'pending',
    createdAt: '2026-10-06T00:00:00Z',
    notifyOptIn: true,
    submission: { revisionId: 'synthetic', originalText: 'نص تجريبي اصطناعي محفوظ' },
    report: null,
    responses: [],
    notifications: [],
  });
  render(<ReviewerDetail navigate={vi.fn()} ticketCode={code} />);
  await screen.findByLabelText('خلاصة المراجعة');
}
async function publish() {
  fireEvent.click(screen.getByRole('button', { name: 'تحديث التقرير ونشر المراجعة' }));
  fireEvent.click(screen.getByRole('button', { name: 'تأكيد نشر التقرير' }));
}
describe('reviewer publication validation', () => {
  it('reproduces the unsupported greeting suggestion, names its field and preserves every edit', async () => {
    await showTicket();
    fireEvent.change(screen.getByLabelText('خلاصة المراجعة'), {
      target: { value: 'خلاصة لم تحسم الأدلة' },
    });
    fireEvent.change(
      screen.getByLabelText('النص المعدل المقترح من المراجع (اختياري، يحتاج دليلًا)'),
      { target: { value: 'السلام عليكم ورحمة الله وبركاته' } },
    );
    fireEvent.change(screen.getByLabelText('ملاحظة المراجع ونصيحته للمستخدم'), {
      target: { value: 'يلزم سياق إضافي قبل الحسم.' },
    });
    await publish();
    const alert = await screen.findByRole('alert', { name: 'أخطاء نشر التقرير' });
    expect(alert.textContent).toContain('اترك هذا الحقل الاختياري فارغًا لنشر الملاحظات فقط');
    expect(alert.textContent).not.toContain('HTTPS');
    expect(vi.mocked(saveReviewerResponse)).not.toHaveBeenCalled();
    expect(
      (
        screen.getByLabelText(
          'النص المعدل المقترح من المراجع (اختياري، يحتاج دليلًا)',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('السلام عليكم ورحمة الله وبركاته');
    expect((screen.getByLabelText('خلاصة المراجعة') as HTMLTextAreaElement).value).toBe(
      'خلاصة لم تحسم الأدلة',
    );
    expect(
      (screen.getByLabelText('ملاحظة المراجع ونصيحته للمستخدم') as HTMLTextAreaElement).value,
    ).toBe('يلزم سياق إضافي قبل الحسم.');
    fireEvent.change(
      screen.getByLabelText('النص المعدل المقترح من المراجع (اختياري، يحتاج دليلًا)'),
      { target: { value: '' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد نشر التقرير' }));
    await waitFor(() => expect(saveReviewerResponse).toHaveBeenCalledOnce());
    expect(vi.mocked(saveReviewerResponse).mock.calls[0]).toEqual([
      code,
      expect.objectContaining({
        publish: true,
        text: 'يلزم سياق إضافي قبل الحسم.',
        editorial: expect.objectContaining({ suggestedText: '', summary: 'خلاصة لم تحسم الأدلة' }),
      }),
    ]);
  });
  it('names the actual source fields and preserves HTTPS and complete-source rejection', () => {
    const parsed = EditorialReviewSchema.safeParse({
      ...initialEditorialReview(null),
      evidence: [
        {
          id: 's',
          work: '',
          reference: '',
          edition: '',
          sourceUrl: 'http://example.com',
          originalText: '',
          context: '',
        },
      ],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const messages = reviewPublicationValidationMessages(parsed.error.issues).join('\n');
    expect(messages).toContain('المصدر 1 — اسم الكتاب أو المصدر');
    expect(messages).toContain('المصدر 1 — المرجع المحدد');
    expect(messages).toContain('المصدر 1 — النص الأصلي في المصدر');
    expect(messages).toContain('المصدر 1 — رابط المصدر HTTPS');
  });
  it('locates an unsupported resolved record and an absent linked source without weakening the gates', () => {
    const parsed = EditorialReviewSchema.safeParse({
      ...initialEditorialReview(null),
      records: [
        {
          id: 'r',
          kind: 'analysis',
          status: 'supported',
          originalText: 'نص',
          correctedText: '',
          explanation: '',
          evidenceIds: ['absent'],
        },
      ],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const messages = reviewPublicationValidationMessages(parsed.error.issues).join('\n');
    expect(messages).toContain('السجل 1: يوجد ارتباط بدليل غير موجود');
    expect(messages).toContain('السجل 1: الحالة محسومة');
  });
});
