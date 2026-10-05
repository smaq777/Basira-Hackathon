// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { RewritePanel } from './rewrite.js';
import { foundationReportFixture } from './foundation-report.fixtures.js';
import type { RewriteCandidate } from '../../../packages/contracts/src/rewrite.js';
const report = foundationReportFixture();
const candidate: RewriteCandidate = {
  id: '33333333-3333-4333-8333-333333333333',
  reviewId: report.reviewId,
  revisionId: report.revisionId,
  inputSha256: report.inputSha256,
  evidenceStateSha256: report.evidenceStateSha256,
  status: 'pending',
  text: null,
  operations: null,
  unresolved: ['دعم الاستدلال لم يُقيّم.'],
  errorCode: null,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  mode: 'citation_and_layout_only',
  scholarlyApproval: false,
  storage: 'session_bound_memory',
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('shows substantive before/after wording and limits the claimed coverage to changed supported spans', async () => {
  const user = userEvent.setup();
  const originalText = 'كلام الكاتب فيه معنى مدعوم ولكنه يحتاج صياغه';
  const replacementText = 'تحتاج عبارة الكاتب المدعومة إلى تحسين الصياغة.';
  const ready = {
    ...candidate,
    mode: 'supported_author_wording',
    status: 'validated',
    text: replacementText,
    operations: {
      paragraphBreaks: [],
      citations: [],
      replacements: [
        { claimId: 'author', originalText, replacementText, evidenceKeys: ['source'] },
      ],
    },
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input) === '/api/v1/capabilities'
      ? json({ draftRewrite: true, draftRewriteMode: 'supported_author_wording' })
      : json({ candidate: ready }),
  );
  const view = render(<RewritePanel report={report} />);
  await user.click(await screen.findByRole('button', { name: 'تحسين الصياغة وإضافة التوثيق' }));
  await screen.findByRole('button', { name: 'نسخ النص المقترح' });
  expect(view.container.querySelector('del')?.textContent).toBe(originalText);
  expect(view.container.querySelector('ins')?.textContent).toBe(replacementText);
  expect(
    screen.getByText(
      'حُسّنت العبارات المعروضة في المقارنة فقط. بقيت بقية العبارات، بما فيها غير المدعومة أو غير المراجعة، كما وردت.',
    ),
  ).not.toBeNull();
});

it('offers copy only after validation and requests a fresh server copy check before clipboard access', async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const ready = {
    ...candidate,
    status: 'validated',
    text: report.intake.originalText,
    operations: { paragraphBreaks: [], citations: [] },
  };
  let polls = 0;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === '/api/v1/capabilities')
      return json({ draftRewrite: true, draftRewriteMode: 'citation_and_layout_only' });
    if (path.endsWith('/copy')) return json({ text: ready.text });
    if (init?.method === 'POST') return json({ candidate });
    polls++;
    return json({ candidate: ready });
  });
  render(<RewritePanel report={report} />);
  await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
  expect(screen.queryByRole('button', { name: 'نسخ النص المقترح' })).toBeNull();
  expect(clipboard).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'نسخ النص المقترح' }));
  expect(polls).toBeGreaterThan(0);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/copy'))).toBe(true);
  expect(clipboard).toHaveBeenCalledWith(report.intake.originalText);
  expect(await screen.findByText('نُسخ النص المقترح.')).not.toBeNull();
  expect(
    screen.getByText(
      'لم ينتج الاقتراح إضافة مناسبة؛ النص المعروض هو الأصل كما ورد، دون توثيق جديد.',
    ),
  ).not.toBeNull();
});

it('cancels by request key on unmount before late create resolves and never displays or copies its result', async () => {
  const user = userEvent.setup();
  let resolveCreate!: (value: Response) => void;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === '/api/v1/capabilities')
      return json({ draftRewrite: true, draftRewriteMode: 'citation_and_layout_only' });
    if (init?.method === 'POST') return new Promise((resolve) => (resolveCreate = resolve));
    return json({ candidate: { ...candidate, status: 'cancelled', errorCode: 'cancelled' } });
  });
  const view = render(<RewritePanel report={report} />);
  await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
  view.unmount();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([, init]) =>
          init?.method === 'DELETE' &&
          Boolean((init.headers as Record<string, string>)['Idempotency-Key']),
      ),
    ).toBe(true),
  );
  resolveCreate(json({ candidate }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE').length,
    ).toBeGreaterThan(1),
  );
  expect(screen.queryByRole('button', { name: 'نسخ النص المقترح' })).toBeNull();
});

it.each(['unmount', 'replace report'])(
  'never writes a late copy response after %s',
  async (action) => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const ready = {
      ...candidate,
      status: 'validated',
      text: report.intake.originalText,
      operations: { paragraphBreaks: [], citations: [] },
    };
    let resolveCopy!: (value: Response) => void;
    let copySignal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/capabilities')
        return json({ draftRewrite: true, draftRewriteMode: 'citation_and_layout_only' });
      if (String(input).endsWith('/copy')) {
        copySignal = init?.signal;
        return new Promise((resolve) => (resolveCopy = resolve));
      }
      return json({ candidate: ready });
    });
    const view = render(<RewritePanel report={report} />);
    await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
    await user.click(await screen.findByRole('button', { name: 'نسخ النص المقترح' }));
    if (action === 'unmount') view.unmount();
    else
      view.rerender(<RewritePanel report={{ ...report, evidenceStateSha256: 'f'.repeat(64) }} />);
    expect(copySignal?.aborted).toBe(true);
    resolveCopy(json({ text: ready.text }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(clipboard).not.toHaveBeenCalled();
  },
);

it('keeps the replacement candidate current when an aborted old create resolves late', async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const replacement = { ...report, evidenceStateSha256: 'e'.repeat(64) };
  const ready = {
    ...candidate,
    id: '44444444-4444-4444-8444-444444444444',
    evidenceStateSha256: replacement.evidenceStateSha256,
    status: 'validated',
    text: report.intake.originalText,
    operations: { paragraphBreaks: [], citations: [] },
  };
  let releaseOld!: (response: Response) => void;
  let creates = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === '/api/v1/capabilities')
      return json({ draftRewrite: true, draftRewriteMode: 'citation_and_layout_only' });
    if (path.endsWith('/copy')) return json({ text: ready.text });
    if (init?.method === 'POST') {
      creates++;
      if (creates === 1) return new Promise((resolve) => (releaseOld = resolve));
      return json({ candidate: ready });
    }
    return json({ candidate: { ...candidate, status: 'cancelled' } });
  });
  const view = render(<RewritePanel report={report} />);
  await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
  view.rerender(<RewritePanel report={replacement} />);
  await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
  await screen.findByRole('button', { name: 'نسخ النص المقترح' });
  releaseOld(json({ candidate }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await user.click(screen.getByRole('button', { name: 'نسخ النص المقترح' }));
  expect(clipboard).toHaveBeenCalledWith(ready.text);
});

it.each(['replace report', 'generate again'])(
  'ignores a cancellation response belonging to the earlier generation after %s',
  async (action) => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const replacement =
      action === 'replace report' ? { ...report, evidenceStateSha256: 'e'.repeat(64) } : report;
    const ready = {
      ...candidate,
      id: '44444444-4444-4444-8444-444444444444',
      evidenceStateSha256: replacement.evidenceStateSha256,
      status: 'validated',
      text: report.intake.originalText,
      operations: { paragraphBreaks: [], citations: [] },
    };
    let releaseCancel!: (response: Response) => void;
    let creates = 0;
    let cancellations = 0;
    const createKeys: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === '/api/v1/capabilities')
        return json({ draftRewrite: true, draftRewriteMode: 'citation_and_layout_only' });
      if (path.endsWith('/copy')) return json({ text: ready.text });
      if (init?.method === 'POST') {
        createKeys.push((init.headers as Record<string, string>)['Idempotency-Key']!);
        return json({ candidate: ++creates === 1 ? candidate : ready });
      }
      if (init?.method === 'DELETE') {
        if (++cancellations === 1) return new Promise((resolve) => (releaseCancel = resolve));
        return json({ candidate: { ...candidate, status: 'cancelled' } });
      }
      return new Promise(() => undefined);
    });
    const view = render(<RewritePanel report={report} />);
    await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
    await user.click(await screen.findByRole('button', { name: 'إلغاء الاقتراح' }));
    if (action === 'replace report') view.rerender(<RewritePanel report={replacement} />);
    await user.click(await screen.findByRole('button', { name: 'تنسيق النص وإضافة التوثيق' }));
    await screen.findByRole('button', { name: 'نسخ النص المقترح' });
    releaseCancel(json({ candidate: { ...candidate, status: 'cancelled' } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(createKeys[1]).not.toBe(createKeys[0]);
    await user.click(screen.getByRole('button', { name: 'نسخ النص المقترح' }));
    expect(clipboard).toHaveBeenCalledWith(ready.text);
  },
);
