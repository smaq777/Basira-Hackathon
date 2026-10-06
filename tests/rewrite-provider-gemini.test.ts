import { afterEach, expect, it, vi } from 'vitest';
import {
  createAuthorRewriteGenerator,
  createAuthorRewriteVerifier,
  createRewriteGenerator,
  REWRITE_MODEL,
} from '../apps/api/src/rewrite-provider.js';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';
import { createRewriteService, validateRewrite } from '../apps/api/src/rewrite.js';
import * as geminiTransport from '../apps/api/src/gemini-backup.js';
import { sha256 } from '../apps/api/src/foundation.js';

function ownedReportFixture() {
  const report = foundationReportFixture();
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  for (const evidence of report.intake.evidence)
    evidence.originalSha256 = sha256(evidence.originalText);
  return report;
}

const input = {
  originalText: 'نص تحريري تجريبي.',
  paragraphOffsets: [],
  allowedCitations: [],
  remainingUtf16Units: 2981,
  authorClaims: [],
};
const operations = { replacements: [], paragraphBreaks: [], citations: [] };
const verification = { schemaVersion: 2, checks: [] };
const backup = { apiKey: 'synthetic-gemini-test' };
const primary = (value: unknown, extra = {}) =>
  new Response(
    JSON.stringify({
      model: REWRITE_MODEL,
      provider: 'OpenAI',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
      ...extra,
    }),
  );
const gemini = (value: unknown, extra = {}) =>
  new Response(
    JSON.stringify({
      modelVersion: 'gemini-2.5-flash',
      candidates: [
        {
          finishReason: 'STOP',
          content: { role: 'model', parts: [{ text: JSON.stringify(value) }] },
        },
      ],
      ...extra,
    }),
  );
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

for (const status of [401, 402, 403, 429, 500, 503, 599]) {
  it(`uses one native Gemini backup after primary HTTP ${status}, preserving the author packet and schema`, async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(gemini(operations));
    await expect(
      createAuthorRewriteGenerator(
        'synthetic-openrouter-test',
        fetcher,
        backup,
      )(input, new AbortController().signal),
    ).resolves.toEqual(operations);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(new Headers(init!.headers).get('x-goog-api-key')).toBe(backup.apiKey);
    expect(new Headers(init!.headers).has('Authorization')).toBe(false);
    const original = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const converted = JSON.parse(init!.body as string);
    expect(converted.systemInstruction.parts[0].text).toBe(original.messages[0].content);
    expect(converted.contents[0].parts[0].text).toBe(original.messages[1].content);
    const schema = converted.generationConfig.responseJsonSchema;
    const full = original.response_format.json_schema.schema;
    expect(schema).toMatchObject({
      type: full.type,
      required: full.required,
      additionalProperties: false,
    });
    expect(schema.properties.replacements).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        required: full.properties.replacements.items.required,
        additionalProperties: false,
        properties: {
          claimId: { type: 'string' },
          evidenceKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    });
    expect(schema.properties.citations.items).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: full.properties.citations.items.required,
      properties: { offset: { type: 'integer' }, evidenceKey: { type: 'string' } },
    });
    expect(schema.properties.replacements.items.properties.claimId).not.toHaveProperty('maxLength');
    expect(converted.generationConfig.maxOutputTokens).toBe(4000);
  });
}

it('independently backs up verifier transport and retains a negative preservation decision', async () => {
  const rejected = {
    schemaVersion: 2,
    checks: [
      {
        claimId: 'owned-control',
        meaningPreserved: false,
        evidenceSupported: true,
        conditionsPreserved: true,
        negationsPreserved: true,
        exceptionsPreserved: true,
        scopePreserved: true,
        modalityPreserved: false,
        citations: [{ evidenceKey: 'source', excerpt: 'نص تجريبي' }],
        explanation: 'تغير معنى النص التجريبي.',
      },
    ],
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('synthetic transport failure'))
    .mockResolvedValueOnce(gemini(rejected));
  await expect(
    createAuthorRewriteVerifier('synthetic-openrouter-test', fetcher, backup)(
      input,
      operations,
      new AbortController().signal,
    ),
  ).resolves.toEqual(rejected);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
  expect(body.systemInstruction.parts[0].text).toContain('BOTH original entails replacement');
  expect(body.generationConfig.responseJsonSchema.properties.checks.items.required).toContain(
    'modalityPreserved',
  );
});

it('uses the same bounded backup for citation-only generation', async () => {
  const layout = { paragraphBreaks: [], citations: [] };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 402 }))
    .mockResolvedValueOnce(gemini(layout));
  await expect(
    createRewriteGenerator(
      'synthetic-openrouter-test',
      fetcher,
      backup,
    )(input, new AbortController().signal),
  ).resolves.toEqual(layout);
  expect(
    JSON.parse(fetcher.mock.calls[1]![1]!.body as string).generationConfig.maxOutputTokens,
  ).toBe(1200);
});

for (const status of [400, 404, 408, 422]) {
  it(`does not conceal an ineligible HTTP ${status}`, async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    await expect(
      createAuthorRewriteGenerator(
        'synthetic-openrouter-test',
        fetcher,
        backup,
      )(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
}

for (const [name, response] of [
  ['JSON syntax', () => new Response('{')],
  ['missing body', () => new Response(null)],
  ['foreign model', () => primary(operations, { model: 'other-model' })],
  ['foreign supplier', () => primary(operations, { provider: 'Google' })],
  ['extra prose field', () => primary({ ...operations, text: 'unauthorized prose' })],
  [
    'truncation',
    () =>
      primary(operations, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
  ],
  ['oversized response', () => new Response('x'.repeat(40_001))],
  ['invalid UTF-8', () => new Response(new Uint8Array([0xff]))],
] as const) {
  it(`does not back up successful transport with invalid ${name}`, async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    await expect(
      createAuthorRewriteGenerator(
        'synthetic-openrouter-test',
        fetcher,
        backup,
      )(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
}

it('does not turn verifier schema rejection into a new preservation opinion', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(primary({ ...verification, schemaVersion: 1 }));
  await expect(
    createAuthorRewriteVerifier('synthetic-openrouter-test', fetcher, backup)(
      input,
      operations,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not call backup without explicit configuration or after primary cancellation', async () => {
  const missing = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('synthetic outage'));
  await expect(
    createAuthorRewriteGenerator('synthetic-openrouter-test', missing)(
      input,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(missing).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const cancelled = vi.fn<typeof fetch>(async () => {
    controller.abort();
    return new Response(null, { status: 403 });
  });
  await expect(
    createAuthorRewriteGenerator(
      'synthetic-openrouter-test',
      cancelled,
      backup,
    )(input, controller.signal),
  ).rejects.toThrow();
  expect(cancelled).toHaveBeenCalledTimes(1);
});

it('bounds backup to one attempt and rejects Gemini model drift', async () => {
  for (const response of [
    new Response(null, { status: 503 }),
    gemini(operations, { modelVersion: 'foreign-model' }),
  ]) {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(response);
    await expect(
      createAuthorRewriteGenerator(
        'synthetic-openrouter-test',
        fetcher,
        backup,
      )(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});

for (const status of [401, 403, 429, 503]) {
  it(`tries the distinct second Gemini key once after first Gemini HTTP ${status}`, async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(gemini(operations));
    await expect(
      createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
        ...backup,
        secondaryApiKey: 'synthetic-second-key',
      })(input, new AbortController().signal),
    ).resolves.toEqual(operations);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Headers(fetcher.mock.calls[2]![1]!.headers).get('x-goog-api-key')).toBe(
      'synthetic-second-key',
    );
    expect(fetcher.mock.calls[1]![1]!.body).toBe(fetcher.mock.calls[2]![1]!.body);
  });
}

it('never repeats a duplicated key, and supports a secondary-only explicit configuration', async () => {
  const duplicate = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(
    createAuthorRewriteGenerator('synthetic-openrouter-test', duplicate, {
      ...backup,
      secondaryApiKey: backup.apiKey,
    })(input, new AbortController().signal),
  ).rejects.toThrow();
  expect(duplicate).toHaveBeenCalledTimes(2);
  const secondary = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(gemini(operations));
  await expect(
    createAuthorRewriteGenerator('synthetic-openrouter-test', secondary, {
      apiKey: '',
      secondaryApiKey: 'synthetic-second-key',
    })(input, new AbortController().signal),
  ).resolves.toEqual(operations);
  expect(new Headers(secondary.mock.calls[1]![1]!.headers).get('x-goog-api-key')).toBe(
    'synthetic-second-key',
  );
});

for (const invalid of [
  () => gemini({ ...operations, text: 'new assertion' }),
  () => gemini(operations, { modelVersion: 'foreign-model' }),
  () => gemini(operations, { promptFeedback: { blockReason: 'SAFETY' } }),
  () => new Response(null, { status: 400 }),
]) {
  it('does not use the second key to replace an invalid first Gemini output or request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(invalid());
    await expect(
      createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
        ...backup,
        secondaryApiKey: 'synthetic-second-key',
      })(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
}

it('keeps server citation binding rejection outside provider fallback', async () => {
  const inventedCitation = {
    ...operations,
    citations: [{ offset: 1, evidenceKey: 'invented-source' }],
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(primary(inventedCitation));
  const result = await createAuthorRewriteGenerator(
    'synthetic-openrouter-test',
    fetcher,
    backup,
  )(input, new AbortController().signal);
  try {
    validateRewrite(ownedReportFixture(), result);
    throw Error('Expected citation binding rejection');
  } catch (error) {
    expect(error).toMatchObject({ code: 'REWRITE_INVALID_CANDIDATE', reason: 'citation_binding' });
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('backs up a network failure while reading the primary response body', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('synthetic interrupted network'));
          },
        }),
      ),
    )
    .mockResolvedValueOnce(gemini(operations));
  await expect(
    createAuthorRewriteGenerator(
      'synthetic-openrouter-test',
      fetcher,
      backup,
    )(input, new AbortController().signal),
  ).resolves.toEqual(operations);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('bounds a stalled primary to 30 seconds and each Gemini key to 15 without resetting the parent', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(new Response(new ReadableStream()))
    .mockResolvedValueOnce(gemini(operations));
  const parent = new AbortController().signal;
  const result = expect(
    createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
      ...backup,
      secondaryApiKey: 'synthetic-second-key',
    })(input, parent),
  ).resolves.toEqual(operations);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(14_999);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(parent.aborted).toBe(false);
  expect((fetcher.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true);
  expect((fetcher.mock.calls[1]![1]!.signal as AbortSignal).aborted).toBe(true);
});

it('lets the parent deadline win during primary or first Gemini and prevents later attempts', async () => {
  vi.useFakeTimers();
  for (const duringBackup of [false, true]) {
    const parent = new AbortController();
    const fetcher = vi.fn<typeof fetch>();
    if (duringBackup) fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    fetcher.mockImplementation(() => new Promise(() => {}));
    const result = expect(
      createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
        ...backup,
        secondaryApiKey: 'synthetic-second-key',
      })(input, parent.signal),
    ).rejects.toThrow('owned parent deadline');
    setTimeout(() => parent.abort(new Error('owned parent deadline')), 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(duringBackup ? 2 : 1);
  }
});

for (const [name, value] of [
  [
    'string length',
    {
      ...operations,
      replacements: [
        {
          claimId: 'x'.repeat(161),
          originalText: 'نص',
          replacementText: 'نص آخر',
          evidenceKeys: ['source'],
        },
      ],
    },
  ],
  [
    'array length',
    {
      ...operations,
      citations: Array.from({ length: 13 }, () => ({ offset: 1, evidenceKey: 'source' })),
    },
  ],
  ['numeric range', { ...operations, paragraphBreaks: [3001] }],
] as const) {
  it(`enforces the original server ${name} bound omitted from Gemini's generation schema`, async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(gemini(value));
    await expect(
      createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
        ...backup,
        secondaryApiKey: 'synthetic-second-key',
      })(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
}

it('does not prepare a backup body when the primary response succeeds', async () => {
  const convert = vi.spyOn(geminiTransport, 'geminiBackupBody');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(primary(operations));
  await expect(
    createAuthorRewriteGenerator(
      'synthetic-openrouter-test',
      fetcher,
      backup,
    )(input, new AbortController().signal),
  ).resolves.toEqual(operations);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(convert).not.toHaveBeenCalled();
});

it('classifies malformed Gemini output as output rejection in the existing private service receipt', async () => {
  const receipt = vi.fn();
  const context = { report: ownedReportFixture(), attempt: 1 };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(gemini(operations, { modelVersion: 'foreign-model' }));
  const service = createRewriteService(
    createAuthorRewriteGenerator('synthetic-openrouter-test', fetcher, {
      ...backup,
      secondaryApiKey: 'synthetic-second-key',
    }),
    { onFailureDiagnostic: receipt },
  );
  try {
    const candidate = service.create('owned-test', 'test-key', context, async () => context);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(service.get('owned-test', candidate.id, context)).toMatchObject({
      status: 'failed',
      text: null,
    });
    expect(receipt).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'generation', reason: 'provider_output_invalid' }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    service.close();
  }
});
