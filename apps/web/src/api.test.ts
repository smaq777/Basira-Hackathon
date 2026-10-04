// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisErrorMessage, BasirahApiError, persistDraftForAnalysis } from './api.js';

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
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/sessions');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/v1/revisions/rev/extractions');
    for (const [, init] of fetchMock.mock.calls)
      expect((init as RequestInit).credentials).toBe('same-origin');
  });

  it('reuses a valid ownership cookie without replacing the session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ documentId: 'doc', revisionId: 'rev' }, 201))
      .mockResolvedValueOnce(jsonResponse({ extraction: { candidates: [], warnings: [] } }));

    await persistDraftForAnalysis('نص عربي صالح للمراجعة');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/sessions')).toBe(false);
  });

  it('maps transport failures to a recoverable Arabic message', () => {
    expect(analysisErrorMessage(new BasirahApiError('NETWORK_ERROR', 0))).toContain('تعذر الاتصال');
  });
});
