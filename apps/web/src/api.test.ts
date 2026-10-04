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

  it('sends the exact draft and creates the bound review with an idempotency key', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ documentId: 'doc', revisionId: REVISION_ID }, 201))
      .mockResolvedValueOnce(jsonResponse({ extraction: { candidates: [], warnings: [] } }))
      .mockResolvedValueOnce(jsonResponse(ownedReviewFixture('queued'), 202));
    const receipt = await persistDraftForAnalysis(ORIGINAL_TEXT);
    await createOwnedReview(receipt.revisionId, 'stable-key');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).text).toBe(ORIGINAL_TEXT);
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
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
});
