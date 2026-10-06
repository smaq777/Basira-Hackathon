import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import {
  createSemanticAssessmentAdapter,
  type SemanticAssessmentOptions,
} from '../apps/api/src/semantic-assessment.js';
import {
  GEMINI_BACKUP_ENDPOINT,
  GEMINI_BACKUP_MODEL,
  GEMINI_BACKUP_PROVIDER,
} from '../apps/api/src/gemini-backup.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';

const SOURCE = 'يحفظ الكاتب الحقوق ما لم يتعذر ذلك.';
const TEXT = 'لذلك يجب حفظ الحقوق.';
const extractor = { modelId: 'owned/extractor', providerId: 'owned-a' };
const assessor = { modelId: 'owned/assessor', providerId: 'owned-a' };
function intake(): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned-fixture',
    corpusVersion: 'owned-fixture',
    revisionId: randomUUID(),
    revisionSha256: sha256(TEXT),
    originalText: TEXT,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author-1',
        startOffset: 0,
        endOffset: TEXT.length,
        codePointStart: 0,
        codePointEnd: TEXT.length,
        originalText: TEXT,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'owned-fixture',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
    evidence: [
      {
        snapshotKey: 'owned-source',
        sourceId: 'owned',
        sourceVersion: 'fixture-1',
        sourceRole: 'quran_text',
        reference: 'owned:1',
        originalText: SOURCE,
        originalSha256: sha256(SOURCE),
        work: 'Owned synthetic fixture',
        author: null,
        edition: null,
        sourceUrl: null,
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: null,
        delivery: 'snapshot',
        retrievalModes: ['exact'],
        provenance: {},
      },
    ],
  };
}
function options(
  fetch: typeof globalThis.fetch,
  extra: Partial<SemanticAssessmentOptions> = {},
): SemanticAssessmentOptions {
  return {
    enabled: true,
    researchPreview: true,
    apiKey: 'owned-openrouter-secret',
    extractor,
    assessor,
    allowedModels: [extractor.modelId, assessor.modelId],
    allowedProviders: [extractor.providerId],
    geminiBackup: { apiKey: 'owned-google-secret' },
    fetch,
    ...extra,
  };
}
function primary(payload: unknown) {
  return new Response(
    JSON.stringify({
      model: extractor.modelId,
      provider: extractor.providerId,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }),
  );
}
function native(payload: unknown, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      modelVersion: GEMINI_BACKUP_MODEL,
      responseId: 'owned-google-response',
      candidates: [
        {
          index: 0,
          finishReason: 'STOP',
          content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] },
        },
      ],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
      ...extra,
    }),
  );
}
function data(init?: RequestInit, google = false) {
  const body = JSON.parse(String(init?.body));
  return JSON.parse(google ? body.contents[0].parts[0].text : body.messages[1].content)
    .untrustedData;
}
function payload(init?: RequestInit, google = false) {
  const packet = data(init, google);
  if (packet.candidates)
    return { claims: [{ candidateId: packet.candidates[0].candidateId, evidenceKeys: ['E1'] }] };
  if (!packet.claims[0].claim)
    return { selections: [{ claimId: packet.claims[0].claimId, evidenceKeys: ['E1'] }] };
  return {
    assessments: [
      {
        claimId: packet.claims[0].claim.id,
        status: 'supported',
        conditions: [],
        negations: [],
        exceptions: [],
        scope: ['حفظ الحقوق'],
        citations: [{ evidenceKey: 'owned-source', excerpt: SOURCE }],
        explanation: 'يدعم النص العبارة ضمن نطاقه.',
      },
    ],
  };
}
function succeedingGoogle() {
  return vi.fn<typeof globalThis.fetch>(async (url, init) =>
    String(url) === GEMINI_BACKUP_ENDPOINT ? native(payload(init, true)) : primary(payload(init)),
  );
}
afterEach(() => vi.useRealTimers());

describe('direct Gemini semantic transport backup', () => {
  it.each(['primary', 'first-google'])(
    'recovers from an interrupted %s response stream',
    async (stage) => {
      const interrupted = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new TypeError('owned interrupted network stream'));
          },
        }),
      );
      const fetch = succeedingGoogle();
      if (stage === 'first-google')
        fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
      fetch.mockResolvedValueOnce(interrupted);
      const result = await createSemanticAssessmentAdapter(
        options(fetch, {
          geminiBackup: {
            apiKey: 'owned-google-secret',
            secondaryApiKey: 'owned-google-second-secret',
          },
        }),
      ).assess(intake());
      expect(result.status).toBe('completed');
      expect(result.trace.requests[stage === 'primary' ? 0 : 1]!.outcome).toBe(
        'upstream_unavailable',
      );
      expect(fetch).toHaveBeenCalledTimes(stage === 'primary' ? 3 : 4);
    },
  );
  it.each(['primary', 'first-google'])('never retries malformed UTF8 from %s', async (stage) => {
    const fetch = succeedingGoogle();
    if (stage === 'first-google') fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([0xff])));
    const result = await createSemanticAssessmentAdapter(
      options(fetch, {
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    expect(result.errorCode).toBe('invalid_response');
    expect(fetch).toHaveBeenCalledTimes(stage === 'primary' ? 1 : 2);
  });
  it('cancels unused error response bodies before progressing to each backup', async () => {
    const cancelPrimary = vi.fn();
    const cancelGoogle = vi.fn();
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel: cancelPrimary }), { status: 403 }),
    );
    fetch.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel: cancelGoogle }), { status: 503 }),
    );
    const result = await createSemanticAssessmentAdapter(
      options(fetch, {
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    expect(result.status).toBe('completed');
    expect(cancelPrimary).toHaveBeenCalledTimes(1);
    expect(cancelGoogle).toHaveBeenCalledTimes(1);
  });
  it('cancels a hanging response stream on timeout without resetting the stage deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const pending = createSemanticAssessmentAdapter(
      options(fetch, { extractionTimeoutMs: 90 }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(45);
    const result = await pending;
    expect(result.status).toBe('completed');
    expect(result.trace.requests[0]!.outcome).toBe('timeout');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('cancels an oversized response without trying either backup key', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(100001));
          },
          cancel,
        }),
      ),
    );
    const result = await createSemanticAssessmentAdapter(
      options(fetch, {
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    expect(result.errorCode).toBe('body_too_large');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels a response body after external cancellation without calling a backup', async () => {
    const cancel = vi.fn();
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const controller = new AbortController();
    const pending = createSemanticAssessmentAdapter(options(fetch)).assess(
      intake(),
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    expect((await pending).errorCode).toBe('cancelled');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 402, 403, 429, 500, 503])(
    'switches the run after OpenRouter HTTP%s and preserves identities/hashes',
    async (status) => {
      const fetch = succeedingGoogle();
      fetch.mockResolvedValueOnce(new Response(null, { status }));
      const result = await createSemanticAssessmentAdapter(
        options(fetch, { relevanceFiltering: true }),
      ).assess(intake());
      expect(result.trace.requests.slice(1).map((row) => [row.stage, row.outcome])).toEqual([
        ['extraction', 'success'],
        ['relevance', 'success'],
        ['assessment', 'success'],
      ]);
      expect(result).toMatchObject({ status: 'completed', errorCode: null });
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        'https://openrouter.ai/api/v1/chat/completions',
        GEMINI_BACKUP_ENDPOINT,
        GEMINI_BACKUP_ENDPOINT,
        GEMINI_BACKUP_ENDPOINT,
      ]);
      expect(
        result.trace.requests.map((row) => [row.modelId, row.providerId, row.fallback]),
      ).toEqual([
        [extractor.modelId, extractor.providerId, false],
        ...Array.from({ length: 3 }, () => [GEMINI_BACKUP_MODEL, GEMINI_BACKUP_PROVIDER, true]),
      ]);
      for (const [index, [, init]] of fetch.mock.calls.entries()) {
        expect(result.trace.requests[index]!.requestSha256).toBe(sha256(String(init!.body)));
        const headers = init!.headers as Record<string, string>;
        if (index) {
          expect(headers['x-goog-api-key']).toBe('owned-google-secret');
          expect(headers.Authorization).toBeUndefined();
        } else expect(headers.Authorization).toBe('Bearer owned-openrouter-secret');
      }
      expect(result.trace.requests[0]!.httpStatus).toBe(status);
      expect(result.trace.requests[1]!.usage).toMatchObject({ totalTokens: 5, cost: null });
      expect(JSON.stringify(result)).not.toContain('owned-google-secret');
    },
  );
  it('switches on a network error and never retries a failing Gemini stage', async () => {
    const fetch = succeedingGoogle();
    fetch.mockRejectedValueOnce(new TypeError('owned network failure'));
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const result = await createSemanticAssessmentAdapter(options(fetch)).assess(intake());
    expect(result.errorCode).toBe('upstream_unavailable');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.trace.requests.map((row) => row.outcome)).toEqual([
      'upstream_unavailable',
      'upstream_unavailable',
    ]);
  });
  it('uses only the remaining extraction budget after a primary request timeout', async () => {
    vi.useFakeTimers();
    const fetch = succeedingGoogle();
    fetch.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = createSemanticAssessmentAdapter(
      options(fetch, { requestTimeoutMs: 50, extractionTimeoutMs: 75 }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).status).toBe('completed');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it('does not reset a shared extraction deadline when both transports hang', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const pending = createSemanticAssessmentAdapter(
      options(fetch, { requestTimeoutMs: 50, extractionTimeoutMs: 75 }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(75);
    expect((await pending).errorCode).toBe('timeout');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1]!.signal!.aborted).toBe(true);
  });
  it('does not switch after exhausting the overall budget', async () => {
    vi.useFakeTimers();
    let clock = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      clock = 50;
      return new Response(null, { status: 403 });
    });
    const pending = createSemanticAssessmentAdapter(
      options(fetch, { requestTimeoutMs: 50, overallTimeoutMs: 50, now: () => clock }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).errorCode).toBe('deadline_exceeded');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not switch on external cancellation', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const pending = createSemanticAssessmentAdapter(options(fetch)).assess(
      intake(),
      controller.signal,
    );
    controller.abort();
    expect((await pending).errorCode).toBe('cancelled');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['json', 'identity', 'schema'])(
    'does not switch for malformed primary %s',
    async (kind) => {
      const fetch = succeedingGoogle();
      fetch.mockResolvedValueOnce(
        kind === 'json'
          ? new Response('{bad-json')
          : kind === 'identity'
            ? native({ claims: [] })
            : primary({ invalid: [] }),
      );
      const result = await createSemanticAssessmentAdapter(options(fetch)).assess(intake());
      expect(result.errorCode).toBe('invalid_response');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('does not retry invalid Gemini claim identities', async () => {
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    fetch.mockResolvedValueOnce(
      native({ claims: [{ candidateId: 'C999', evidenceKeys: ['E1'] }] }),
    );
    expect((await createSemanticAssessmentAdapter(options(fetch)).assess(intake())).errorCode).toBe(
      'invalid_claims',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not retry rejected Gemini citations or retain a false verdict', async () => {
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    fetch.mockImplementationOnce(async (_url, init) => native(payload(init, true)));
    fetch.mockImplementationOnce(async (_url, init) => {
      const value = payload(init, true) as { assessments: Array<{ citations: unknown[] }> };
      value.assessments[0]!.citations = [{ evidenceKey: 'owned-source', excerpt: 'invented text' }];
      return native(value);
    });
    const result = await createSemanticAssessmentAdapter(options(fetch)).assess(intake());
    expect(result.errorCode).toBe('invalid_citations');
    expect(result.assessments).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 429, 500, 'network'])(
    'switches Gemini keys once after %s and carries the second key forward',
    async (failure) => {
      const fetch = succeedingGoogle();
      fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
      if (failure === 'network')
        fetch.mockRejectedValueOnce(new TypeError('owned network failure'));
      else fetch.mockResolvedValueOnce(new Response(null, { status: Number(failure) }));
      const result = await createSemanticAssessmentAdapter(
        options(fetch, {
          geminiBackup: {
            apiKey: 'owned-google-secret',
            secondaryApiKey: 'owned-google-second-secret',
          },
        }),
      ).assess(intake());
      expect(result.status).toBe('completed');
      expect(
        fetch.mock.calls
          .slice(1)
          .map(([, init]) => (init!.headers as Record<string, string>)['x-goog-api-key']),
      ).toEqual([
        'owned-google-secret',
        'owned-google-second-secret',
        'owned-google-second-secret',
      ]);
      expect(result.trace.requests.slice(1).map((row) => [row.modelId, row.providerId])).toEqual(
        Array.from({ length: 3 }, () => [GEMINI_BACKUP_MODEL, GEMINI_BACKUP_PROVIDER]),
      );
      expect(JSON.stringify(result)).not.toContain('owned-google-second-secret');
    },
  );
  it('bounds all three hanging transports within the original extraction deadline', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const pending = createSemanticAssessmentAdapter(
      options(fetch, {
        extractionTimeoutMs: 90,
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(90);
    const result = await pending;
    expect(result.errorCode).toBe('timeout');
    expect(result.trace.requests.map((row) => row.durationMs)).toEqual([30, 30, 30]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('shares the assessment deadline across both backup keys after successful primary extraction', async () => {
    vi.useFakeTimers();
    const fetch = succeedingGoogle();
    fetch.mockImplementationOnce(async (_url, init) => primary(payload(init)));
    fetch.mockImplementation(() => new Promise(() => undefined));
    const pending = createSemanticAssessmentAdapter(
      options(fetch, {
        assessmentTimeoutMs: 90,
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    await vi.advanceTimersByTimeAsync(90);
    const result = await pending;
    expect(result).toMatchObject({ status: 'partial', errorCode: 'timeout', assessments: [] });
    expect(result.claims).toHaveLength(1);
    expect(result.trace.requests.slice(1).map((row) => row.durationMs)).toEqual([30, 30, 30]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it.each(['safety', 'identity', 'schema'])(
    'never uses a second key to bypass rejected Gemini %s',
    async (kind) => {
      const fetch = succeedingGoogle();
      fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
      fetch.mockResolvedValueOnce(
        kind === 'safety'
          ? native({ claims: [] }, { promptFeedback: { blockReason: 'SAFETY' } })
          : kind === 'identity'
            ? native({ claims: [] }, { modelVersion: 'other-model' })
            : native({ invalid: [] }),
      );
      const result = await createSemanticAssessmentAdapter(
        options(fetch, {
          geminiBackup: {
            apiKey: 'owned-google-secret',
            secondaryApiKey: 'owned-google-second-secret',
          },
        }),
      ).assess(intake());
      expect(result.errorCode).toBe('invalid_response');
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('does not treat a native Gemini HTTP402 as an authorized second-key transport failure', async () => {
    const fetch = succeedingGoogle();
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    fetch.mockResolvedValueOnce(new Response(null, { status: 402 }));
    const result = await createSemanticAssessmentAdapter(
      options(fetch, {
        geminiBackup: {
          apiKey: 'owned-google-secret',
          secondaryApiKey: 'owned-google-second-secret',
        },
      }),
    ).assess(intake());
    expect(result.errorCode).toBe('gateway_blocked');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['', 'owned-google-secret'])(
    'rejects an empty or duplicate second key without sending requests',
    async (secondaryApiKey) => {
      const fetch = succeedingGoogle();
      const result = await createSemanticAssessmentAdapter(
        options(fetch, {
          geminiBackup: { apiKey: 'owned-google-secret', secondaryApiKey },
        }),
      ).assess(intake());
      expect(result.errorCode).toBe('configuration_invalid');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
