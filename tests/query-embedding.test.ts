import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterQueryEmbedding,
  QUERY_EMBEDDING_MODEL,
  QUERY_EMBEDDING_DIMENSIONS,
} from '../apps/api/src/query-embedding.js';
const vector = () => Array.from({ length: QUERY_EMBEDDING_DIMENSIONS }, () => 0.1);
const envelope = () => ({
  model: QUERY_EMBEDDING_MODEL,
  data: [{ index: 0, embedding: vector() }],
});
afterEach(() => vi.useRealTimers());
describe('bounded compatible query embedding', () => {
  it('pins route and caches by original query with independent returned arrays', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: QUERY_EMBEDDING_MODEL,
        dimensions: 1536,
        provider: { only: ['OpenAI'], allow_fallbacks: false },
      });
      return Response.json(envelope());
    });
    const embed = createOpenRouterQueryEmbedding({ apiKey: 'owned-secret', fetch, cacheSize: 1 });
    const first = await embed('حقوق');
    first[0] = 9;
    expect((await embed('حقوق'))[0]).toBe(0.1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await embed('شرط');
    await embed('حقوق');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['model', 'provider', 'dimensions', 'nonfinite', 'zero'])(
    'rejects incompatible %s without retrying or caching',
    async (failure) => {
      const payload: Record<string, unknown> = envelope();
      if (failure === 'model') payload.model = 'other/model';
      if (failure === 'provider') payload.provider = 'Other';
      if (failure === 'dimensions') payload.data = [{ index: 0, embedding: [1] }];
      if (failure === 'nonfinite')
        payload.data = [{ index: 0, embedding: [...vector().slice(1), null] }];
      if (failure === 'zero') payload.data = [{ index: 0, embedding: vector().map(() => 0) }];
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(payload));
      const embed = createOpenRouterQueryEmbedding({ apiKey: 'owned', fetch });
      await expect(embed('حقوق')).rejects.toThrow('INVALID_EMBEDDING_RESPONSE');
      await expect(embed('حقوق')).rejects.toThrow('INVALID_EMBEDDING_RESPONSE');
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('bounds bodies and rejects invalid input before requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('x'.repeat(100001)));
    const embed = createOpenRouterQueryEmbedding({ apiKey: 'owned', fetch });
    await expect(embed('')).rejects.toThrow('INVALID_EMBEDDING_QUERY');
    await expect(embed('حقوق', AbortSignal.abort())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(embed('حقوق')).rejects.toThrow('EMBEDDING_BODY_TOO_LARGE');
  });
  it('times out even when fetch ignores abort and honors caller cancellation', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const embed = createOpenRouterQueryEmbedding({ apiKey: 'owned', fetch, timeoutMs: 100 });
    const timed = expect(embed('حقوق')).rejects.toThrow('EMBEDDING_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await timed;
    const controller = new AbortController();
    const cancelled = expect(embed('شرط', controller.signal)).rejects.toThrow(
      'EMBEDDING_CANCELLED',
    );
    controller.abort();
    await cancelled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it('accepts only the documented same-model provider-native response alias', async () => {
  const payload = { ...envelope(), model: 'text-embedding-3-small', provider: 'OpenAI' };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(payload));
  const embed = createOpenRouterQueryEmbedding({ apiKey: 'owned', fetch });
  expect(await embed('حقوق')).toHaveLength(1536);
  expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).model).toBe(QUERY_EMBEDDING_MODEL);
});
