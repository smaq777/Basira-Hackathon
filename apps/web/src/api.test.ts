// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analysisErrorMessage,
  BasirahApiError,
  persistDraftForAnalysis,
  requireAnalysisCapability,
} from './api.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
