// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analysisErrorMessage,
  BasirahApiError,
  persistDraftForAnalysis,
  createOwnedReview,
  getFoundationReport,
  awaitFoundationReport,
  requireFoundationReview,
  reviewTicketsAvailable,
  requireAnalysisCapability,
  requestDraftPreflight,
} from './api.js';
import { buildDemoPreflight } from '../../api/src/preflight.js';
import {
  foundationReportFixture,
  ownedReviewFixture,
  REVIEW_ID,
  REVISION_ID,
  ORIGINAL_TEXT,
} from './foundation-report.fixtures.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

it('binds classification spans to the unmodified draft including leading whitespace', async () => {
  const text = '  \n🙂 قال رسول الله ﷺ: «إنما الأعمال بالنيات» [صحيح البخاري: 1].';
  const result = buildDemoPreflight({ text });
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(result));
  await expect(requestDraftPreflight(text)).resolves.toMatchObject({
    annotations: result.annotations,
  });
  const shifted = structuredClone(result);
  shifted.annotations[0]!.startOffset += 1;
  fetchMock.mockResolvedValue(jsonResponse(shifted));
  await expect(requestDraftPreflight(text)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

describe('same-origin draft analysis client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a guest session only after the API rejects a missing session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ guestDocuments: true }))
      .mockResolvedValueOnce(jsonResponse({ code: 'INVALID_OR_EXPIRED_SESSION' }, 401))
      .mockResolvedValueOnce(jsonResponse({ sessionId: 'session', expiresAt: 'later' }, 201))
      .mockResolvedValueOnce(jsonResponse({ documentId: 'doc', revisionId: 'rev' }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ extraction: { candidates: [{ text: 'claim' }], warnings: ['ambiguous'] } }),
      );

    await expect(persistDraftForAnalysis('نص عربي صالح للمراجعة')).resolves.toEqual({
      documentId: 'doc',
      revisionId: 'rev',
      candidateCount: 1,
      warnings: ['ambiguous'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/capabilities');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/sessions');
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/v1/revisions/rev/extractions');
    for (const [, init] of fetchMock.mock.calls)
      expect((init as RequestInit).credentials).toBe('same-origin');
  });

  it('reuses a valid ownership cookie without replacing the session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ guestDocuments: true }))
      .mockResolvedValueOnce(jsonResponse({ documentId: 'doc', revisionId: 'rev' }, 201))
      .mockResolvedValueOnce(jsonResponse({ extraction: { candidates: [], warnings: [] } }));

    await persistDraftForAnalysis('نص عربي صالح للمراجعة');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/sessions')).toBe(false);
  });

  it('aborts an abandoned analysis before it can continue the request sequence', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      });
    });

    const analysis = persistDraftForAnalysis('نص عربي صالح للمراجعة', controller.signal);
    controller.abort();

    await expect(analysis).rejects.toMatchObject({ code: 'REQUEST_ABORTED', status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('maps transport failures to a recoverable Arabic message', () => {
    expect(analysisErrorMessage(new BasirahApiError('NETWORK_ERROR', 0))).toContain('تعذر الاتصال');
  });

  it('sends the exact draft and creates the bound review with an idempotency key', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ guestDocuments: true }))
      .mockResolvedValueOnce(jsonResponse({ documentId: 'doc', revisionId: REVISION_ID }, 201))
      .mockResolvedValueOnce(jsonResponse({ extraction: { candidates: [], warnings: [] } }))
      .mockResolvedValueOnce(jsonResponse(ownedReviewFixture('queued'), 202));
    const receipt = await persistDraftForAnalysis(ORIGINAL_TEXT);
    await createOwnedReview(receipt.revisionId, 'stable-key');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).text).toBe(ORIGINAL_TEXT);
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'stable-key',
    });
  });

  it('declines unavailable capability without persisting the draft', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ foundationReview: false }));
    await expect(requireFoundationReview()).rejects.toMatchObject({
      code: 'FOUNDATION_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts a valid bound report and rejects another revision or changed original text', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ report: foundationReportFixture() }),
    );
    await expect(
      getFoundationReport(REVIEW_ID, { revisionId: REVISION_ID, originalText: ORIGINAL_TEXT }),
    ).resolves.toMatchObject({ reviewId: REVIEW_ID });
    await expect(getFoundationReport(REVIEW_ID, { revisionId: REVIEW_ID })).rejects.toMatchObject({
      code: 'REPORT_BINDING_MISMATCH',
    });
    await expect(
      getFoundationReport(REVIEW_ID, { originalText: ORIGINAL_TEXT.trim() }),
    ).rejects.toMatchObject({ code: 'REPORT_BINDING_MISMATCH' });
  });

  it('rejects a report with fabricated source offsets or an unresolved evidence key', async () => {
    const invalid = foundationReportFixture();
    invalid.intake.segments[0]!.startOffset += 1;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ report: invalid }));
    await expect(getFoundationReport(REVIEW_ID)).rejects.toMatchObject({
      code: 'REPORT_BINDING_MISMATCH',
    });
    const missingSource = foundationReportFixture();
    missingSource.intake.quotationFindings[0]!.evidenceKey = 'unknown';
    fetchMock.mockResolvedValue(jsonResponse({ report: missingSource }));
    await expect(getFoundationReport(REVIEW_ID)).rejects.toMatchObject({
      code: 'REPORT_BINDING_MISMATCH',
    });
  });

  it('keeps pending reports pending and surfaces transport failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ report: null }, 202))
      .mockResolvedValueOnce(jsonResponse({ code: 'REPORT_UNAVAILABLE' }, 503));
    await expect(getFoundationReport(REVIEW_ID)).resolves.toBeNull();
    await expect(getFoundationReport(REVIEW_ID)).rejects.toMatchObject({
      code: 'REPORT_UNAVAILABLE',
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops at cancelled, failed and interrupted runs without requesting a report', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (const status of ['cancelled', 'failed', 'interrupted'] as const)
      await expect(
        awaitFoundationReport(
          { ...ownedReviewFixture(status), status },
          new AbortController().signal,
          vi.fn(),
        ),
      ).rejects.toMatchObject({ code: `REVIEW_${status.toUpperCase()}` });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'text/plain', 'NOT_FOUND'],
    [200, 'text/html', '<html>frontend shell</html>'],
  ])('detects a missing API route (%s) before sending the draft', async (status, type, body) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { status, headers: { 'Content-Type': type } }));
    await expect(persistDraftForAnalysis('نص عربي صالح للمراجعة')).rejects.toMatchObject({
      code: 'API_ROUTE_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('distinguishes an older reachable backend from foundation availability', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ guestDocuments: true }),
    );
    await expect(requireAnalysisCapability('guestDocuments')).resolves.toBeUndefined();
    await expect(requireAnalysisCapability('foundationReview')).rejects.toMatchObject({
      code: 'FOUNDATION_UNAVAILABLE',
    });
  });

  it('does not persist a draft when storage is unavailable', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ guestDocuments: false, foundationReview: false }));
    await expect(persistDraftForAnalysis('نص عربي صالح للمراجعة')).rejects.toMatchObject({
      code: 'ANALYSIS_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves API JSON resource errors instead of treating them as routing failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 'NOT_FOUND' }, 404));
    await expect(requireAnalysisCapability('guestDocuments')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('classifies malformed capabilities as an invalid response, not a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(null));
    await expect(requireAnalysisCapability('guestDocuments')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('explains missing routing and missing foundation setup separately', () => {
    expect(analysisErrorMessage(new BasirahApiError('API_ROUTE_UNAVAILABLE', 404))).toContain(
      'غير مرتبطة',
    );
    expect(analysisErrorMessage(new BasirahApiError('FOUNDATION_UNAVAILABLE', 0))).toContain(
      'غير مفعّلة',
    );
  });
});

describe('transient request errors', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps burst-rate and network failures distinct', () => {
    const burst = new BasirahApiError('RATE_LIMITED', 429);
    const network = new BasirahApiError('NETWORK_ERROR', 0);
    expect(analysisErrorMessage(burst)).toContain('انتظر');
    expect(analysisErrorMessage(network)).toContain('الاتصال');
  });

  it('does not describe a legacy resource response as a permanent session cap', () => {
    const message = analysisErrorMessage(new BasirahApiError('RESOURCE_LIMIT_REACHED', 429));
    expect(message).not.toContain('حد السعة');
    expect(message).not.toContain('مراجعاتك السابقة');
    expect(message).toContain('إعادة المحاولة');
  });
});

describe('strict ticket presentation capability', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    [{ reviewTickets: true }, true],
    [{ reviewTickets: false }, false],
    [{}, false],
    [{ reviewTickets: 'true' }, false],
    [null, 'reject'],
    [[], 'reject'],
    ['true', 'reject'],
  ])('requires literal true in the selected API response %#', async (body, expected) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body));
    if (expected === 'reject')
      await expect(reviewTicketsAvailable()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    else await expect(reviewTicketsAvailable()).resolves.toBe(expected);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.method).toBe('GET');
  });
  it('forwards caller cancellation without creating a session or retrying the lookup', async () => {
    const controller = new AbortController();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const result = reviewTicketsAvailable(controller.signal);
    controller.abort();
    await expect(result).rejects.toBeDefined();
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
