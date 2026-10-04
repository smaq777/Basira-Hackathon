// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import {
  foundationReportFixture,
  ownedReviewFixture,
  ORIGINAL_TEXT,
  REVIEW_ID,
  REVISION_ID,
} from './foundation-report.fixtures.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockReviewApi(
  options: {
    queued?: boolean;
    keepQueued?: boolean;
    reportFailure?: boolean;
    pendingReport?: boolean;
    ownershipExpired?: boolean;
    capability?: boolean;
  } = {},
) {
  let reportRequests = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === '/api/v1/capabilities')
      return json({ foundationReview: options.capability !== false });
    if (path === '/api/v1/documents')
      return json({ documentId: 'doc', revisionId: REVISION_ID }, 201);
    if (path.endsWith('/extractions'))
      return json({ extraction: { candidates: [], warnings: [] } });
    if (path === '/api/v1/reviews')
      return json(ownedReviewFixture(options.queued ? 'queued' : 'partial'), 202);
    if (path === `/api/v1/reviews/${REVIEW_ID}`) {
      if (options.ownershipExpired) return json({ code: 'INVALID_OR_EXPIRED_SESSION' }, 401);
      return json(
        ownedReviewFixture(
          init?.method === 'DELETE' ? 'cancelled' : options.keepQueued ? 'queued' : 'partial',
        ),
      );
    }
    if (path.endsWith('/report')) {
      reportRequests += 1;
      if (options.reportFailure && reportRequests === 1)
        return json({ code: 'REPORT_UNAVAILABLE' }, 503);
      if (options.pendingReport && reportRequests === 1) return json({ report: null }, 202);
      return json({ report: foundationReportFixture() });
    }
    if (path === '/api/v1/preflight')
      return json({
        mode: 'local_demo',
        verification: false,
        corpusVersion: 'software-fixture-v1',
        inputHash: 'a'.repeat(64),
        offsetUnit: 'utf16_code_unit',
        annotations: [],
        findings: [],
        warnings: [],
      });
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe('owned foundation review web flow', () => {
  beforeEach(() => {
    window.location.hash = '#/home';
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('preserves the exact submitted text and replaces the illustrative result with its owned report', async () => {
    const fetchMock = mockReviewApi({ queued: true });
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    expect(screen.getByText('تحليل تلقائي في الخلفية')).not.toBeNull();
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' }, { timeout: 3000 });
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(window.location.hash).toBe(`#/result?reviewId=${REVIEW_ID}`);
    expect(screen.queryByText('لذلك يجب إخفاء كل صدقة ولا يجوز إعلانها.')).toBeNull();
    const draftCall = fetchMock.mock.calls.find(([path]) => path === '/api/v1/documents');
    expect(JSON.parse(String(draftCall?.[1]?.body)).text).toBe(ORIGINAL_TEXT);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/reviews')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([path]) => path === `/api/v1/reviews/${REVIEW_ID}`)).toBe(
      true,
    );
  });

  it('restores a report from its review link after a refresh', async () => {
    const fetchMock = mockReviewApi();
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' });
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/documents')).toBe(false);
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/reviews')).toBe(false);
  });

  it('shows real report failures and retries the same owned review without demo fallback', async () => {
    const fetchMock = mockReviewApi({ reportFailure: true });
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('تعذر عرض التقرير');
    expect(screen.queryByText('راجع النتيجة قبل اعتماد التعديل')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' });
    expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/report'))).toHaveLength(
      2,
    );
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/reviews')).toBe(false);
  });

  it('waits for a pending report rather than claiming completion', async () => {
    mockReviewApi({ pendingReport: true });
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('جار تحميل التقرير');
    expect(screen.queryByText('اكتمل إعداد التقرير')).toBeNull();
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' }, { timeout: 3000 });
  });

  it('confirms server cancellation and returns to the unchanged draft', async () => {
    const fetchMock = mockReviewApi({ queued: true, keepQueued: true });
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await waitFor(() => expect(window.location.hash).toContain(`reviewId=${REVIEW_ID}`));
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));
    await screen.findByRole('textbox', { name: 'النص المراد مراجعته' });
    expect(
      (screen.getByRole('textbox', { name: 'النص المراد مراجعته' }) as HTMLTextAreaElement).value,
    ).toBe(ORIGINAL_TEXT);
    expect(
      fetchMock.mock.calls.some(
        ([path, init]) => path === `/api/v1/reviews/${REVIEW_ID}` && init?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith('/report'))).toBe(false);
  });

  it('waits for an in-flight review creation before confirming server cancellation', async () => {
    const fetchMock = mockReviewApi({ queued: true, keepQueued: true });
    const implementation = fetchMock.getMockImplementation()!;
    let releaseRun!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      releaseRun = resolve;
    });
    fetchMock.mockImplementation((input, init) =>
      String(input) === '/api/v1/reviews' ? pending : implementation(input, init),
    );
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/reviews')).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));
    expect(screen.getByRole('button', { name: 'جار تأكيد الإلغاء' })).not.toBeNull();
    releaseRun(json(ownedReviewFixture('queued'), 202));
    await screen.findByRole('textbox', { name: 'النص المراد مراجعته' });
    expect(
      fetchMock.mock.calls.some(
        ([path, init]) => path === `/api/v1/reviews/${REVIEW_ID}` && init?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith('/report'))).toBe(false);
  });

  it('does not claim cancellation when the server cannot confirm it', async () => {
    const fetchMock = mockReviewApi({ queued: true, keepQueued: true });
    const implementation = fetchMock.getMockImplementation()!;
    let failed = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'DELETE' && !failed) {
        failed = true;
        return json({ code: 'CANCEL_UNAVAILABLE' }, 503);
      }
      return implementation(input, init);
    });
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await waitFor(() => expect(window.location.hash).toContain(`reviewId=${REVIEW_ID}`));
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));
    expect((await screen.findByRole('alert')).textContent).toContain('تعذر تأكيد إلغاء المراجعة');
    expect(screen.queryByRole('textbox', { name: 'النص المراد مراجعته' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));
    await screen.findByRole('textbox', { name: 'النص المراد مراجعته' });
  });

  it('explains expired ownership without starting another session or showing demo findings', async () => {
    const fetchMock = mockReviewApi({ ownershipExpired: true });
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('انتهت جلسة المسودة');
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/sessions')).toBe(false);
    expect(screen.queryByText('اكتملت المقارنة')).toBeNull();
  });

  it('keeps unavailable connected review explicit while preserving the draft', async () => {
    const fetchMock = mockReviewApi({ capability: false });
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    expect((await screen.findByRole('alert')).textContent).toContain('المراجعة المتصلة غير مفعّلة');
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/documents')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));
    expect(
      (screen.getByRole('textbox', { name: 'النص المراد مراجعته' }) as HTMLTextAreaElement).value,
    ).toBe(ORIGINAL_TEXT);
  });

  it('explicitly reanalyzes the identical saved text into a new owned revision and report', async () => {
    const fetchMock = mockReviewApi();
    const implementation = fetchMock.getMockImplementation()!;
    const newRevision = '33333333-3333-4333-8333-333333333333';
    const newReview = '44444444-4444-4444-8444-444444444444';
    const newRun = { ...ownedReviewFixture(), revisionId: newRevision, reviewId: newReview };
    const newReport = foundationReportFixture();
    newReport.reviewId = newReview;
    newReport.revisionId = newRevision;
    newReport.intake.revisionId = newRevision;
    let releaseDraft!: (response: Response) => void;
    const pendingDraft = new Promise<Response>((resolve) => {
      releaseDraft = resolve;
    });
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path === '/api/v1/documents') return pendingDraft;
      if (path === '/api/v1/reviews') return Promise.resolve(json(newRun, 202));
      if (path === `/api/v1/reviews/${newReview}`) return Promise.resolve(json(newRun));
      if (path === `/api/v1/reviews/${newReview}/report`)
        return Promise.resolve(json({ report: newReport }));
      return implementation(input, init);
    });
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' });
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/v1/documents')).toBe(false);
    const button = screen.getByRole('button', { name: 'إعادة تحليل النص' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      screen.getByRole('button', { name: 'جار بدء تحليل جديد' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/documents')).toHaveLength(1);
    releaseDraft(json({ documentId: 'new-document', revisionId: newRevision }, 201));
    await waitFor(() => expect(window.location.hash).toBe(`#/result?reviewId=${newReview}`));
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' });
    const draft = fetchMock.mock.calls.find(([path]) => path === '/api/v1/documents');
    expect(JSON.parse(String(draft?.[1]?.body)).text).toBe(ORIGINAL_TEXT);
    const runs = fetchMock.mock.calls.filter(([path]) => path === '/api/v1/reviews');
    expect(runs).toHaveLength(1);
    expect(JSON.parse(String(runs[0]?.[1]?.body)).revisionId).toBe(newRevision);
    expect((runs[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(
      fetchMock.mock.calls.some(
        ([path, init]) => path === `/api/v1/reviews/${REVIEW_ID}` && init?.method === 'DELETE',
      ),
    ).toBe(false);
  });

  it('keeps the saved report visible and retries review creation with the same revision and idempotency key', async () => {
    const fetchMock = mockReviewApi();
    const implementation = fetchMock.getMockImplementation()!;
    let creationAttempts = 0;
    fetchMock.mockImplementation((input, init) => {
      if (String(input) === '/api/v1/reviews') {
        creationAttempts += 1;
        return Promise.resolve(json({ code: 'REVIEW_UNAVAILABLE' }, 503));
      }
      return implementation(input, init);
    });
    window.location.hash = `#/result?reviewId=${REVIEW_ID}`;
    render(<App />);
    await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' });
    await userEvent.click(screen.getByRole('button', { name: 'إعادة تحليل النص' }));
    expect((await screen.findByRole('alert')).textContent).toContain('تعذر بدء التحليل الجديد');
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'إعادة تحليل النص' }));
    await waitFor(() => expect(creationAttempts).toBe(2));
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/documents')).toHaveLength(1);
    const calls = fetchMock.mock.calls.filter(([path]) => path === '/api/v1/reviews');
    expect(calls[0]?.[1]?.body).toBe(calls[1]?.[1]?.body);
    expect((calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      (calls[1]?.[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(window.location.hash).toBe(`#/result?reviewId=${REVIEW_ID}`);
  });
});
