import { z } from 'zod';
import { sha256 } from './foundation.js';

export const QUERY_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const QUERY_EMBEDDING_DIMENSIONS = 1536;
const MAX_BODY_BYTES = 100_000;
const Envelope = z.object({
  model: z.enum([QUERY_EMBEDDING_MODEL, 'text-embedding-3-small']),
  provider: z.enum(['OpenAI', 'openai']).optional(),
  data: z
    .array(
      z.object({
        index: z.literal(0),
        embedding: z.array(z.number().finite()).length(QUERY_EMBEDDING_DIMENSIONS),
      }),
    )
    .length(1),
});

/** Fixed compatible query space. Failed calls are uncached; no retries or route substitution. */
export function createOpenRouterQueryEmbedding(options: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  cacheSize?: number;
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const cacheSize = options.cacheSize ?? 128;
  if (
    !options.apiKey ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 8000 ||
    !Number.isInteger(cacheSize) ||
    cacheSize < 0 ||
    cacheSize > 1024
  )
    throw new Error('INVALID_EMBEDDING_CONFIGURATION');
  const cache = new Map<string, number[]>();
  return async function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
    signal?.throwIfAborted();
    if (!text.trim() || text.length > 3000) throw new Error('INVALID_EMBEDDING_QUERY');
    const key = sha256(`${QUERY_EMBEDDING_MODEL}:${QUERY_EMBEDDING_DIMENSIONS}:${text}`);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return [...hit];
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const vector = await Promise.race([
        (async () => {
          const response = await fetcher('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: QUERY_EMBEDDING_MODEL,
              dimensions: QUERY_EMBEDDING_DIMENSIONS,
              input: text,
              encoding_format: 'float',
              provider: { only: ['OpenAI'], allow_fallbacks: false, require_parameters: true },
            }),
          });
          if (!response.ok) throw new Error('EMBEDDING_UPSTREAM_UNAVAILABLE');
          if (!response.body) throw new Error('INVALID_EMBEDDING_RESPONSE');
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > MAX_BODY_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new Error('EMBEDDING_BODY_TOO_LARGE');
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
          const parsed = Envelope.safeParse(JSON.parse(raw));
          if (!parsed.success) throw new Error('INVALID_EMBEDDING_RESPONSE');
          const result = parsed.data.data[0]!.embedding;
          if (!result.some((number) => number !== 0)) throw new Error('INVALID_EMBEDDING_RESPONSE');
          return result;
        })(),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error(signal?.aborted ? 'EMBEDDING_CANCELLED' : 'EMBEDDING_TIMEOUT')),
            { once: true },
          );
          timer = setTimeout(abort, timeoutMs);
          if (signal?.aborted) abort();
        }),
      ]);
      signal?.throwIfAborted();
      if (cacheSize) {
        cache.set(key, [...vector]);
        while (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
      }
      return [...vector];
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
