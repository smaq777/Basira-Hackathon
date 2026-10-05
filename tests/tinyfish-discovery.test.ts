import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import data from '../config/source-policy.json' with { type: 'json' };
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import {
  createTinyfishGapDiscovery,
  createTinyfishWebDiscovery,
} from '../apps/api/src/tinyfish-discovery.js';
import { RESEARCH_WEB_POLICIES } from '../apps/api/src/web-discovery.js';

const url = 'https://binbaz.org.sa/fatwas/12/example';
const original = 'نص عربي مملوك للاختبار يحتفظ بشرط الإذن والاستثناء في الفقرة كاملة دون تلخيص.';
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
const page = () => ({
  url,
  final_url: url,
  title: 'مصدر اختبار',
  format: 'markdown',
  text: original,
});
const options = (fetch: typeof globalThis.fetch) => ({
  apiKey: 'fixture-secret',
  policies: RESEARCH_WEB_POLICIES,
  fetch,
});
const goodFetch = () =>
  vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      response({ results: [{ url, snippet: 'invented snippet' }, { url: url + '#duplicate' }] }),
    )
    .mockResolvedValueOnce(response({ results: [page()], errors: [] }));

describe('standalone TinyFish research acquisition', () => {
  it('consumes a fetch rejection when cancellation occurs inside the fetcher', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      controller.abort();
      return Promise.reject(new Error('private upstream cancellation'));
    });
    const result = await createTinyfishWebDiscovery(options(fetch)).discover(
      'اختبار',
      controller.signal,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(result.snapshots).toEqual([]);
    expect(result.failures).toEqual(['discovery_timeout_or_cancelled']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses documented contracts and preserves exact originals with honest provenance', async () => {
    const fetch = goodFetch();
    const result = await createTinyfishWebDiscovery(options(fetch)).discover('شرط الإذن');
    expect(fetch).toHaveBeenCalledTimes(2);
    const search = new URL(String(fetch.mock.calls[0]![0]));
    expect(search.origin).toBe('https://api.search.tinyfish.ai');
    expect(search.searchParams.get('include_domains')).toBe('binbaz.org.sa,shamela.ws');
    expect(search.searchParams.get('language')).toBe('ar');
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { 'X-API-Key': 'fixture-secret' },
    });
    expect(fetch.mock.calls[0]![1]?.body).toBeUndefined();
    expect(fetch.mock.calls[1]![0]).toBe('https://api.fetch.tinyfish.ai');
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toMatchObject({
      urls: [url],
      format: 'markdown',
      ttl: 0,
      include_selectors: ['.fatwa'],
    });
    expect(result.snapshots[0]).toMatchObject({
      originalMarkdown: original,
      provider: 'tinyfish',
      originalSha256: createHash('sha256').update(original).digest('hex'),
      sourceUrl: url,
      approvalStatus: 'pending',
      researchOnly: true,
      originMetadataStatus: 'not_exposed_by_provider',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /invented snippet|fixture-secret|statusCode|contentType/u,
    );
  });

  it.each(['url', 'redirect', 'format', 'size', 'title', 'html', 'error-title', 'not-modified'])(
    'rejects an invalid fetched page: %s',
    async (kind) => {
      const bad: Record<string, unknown> = page();
      if (kind === 'url') bad.url = 'https://binbaz.org.sa/fatwas/99/other';
      if (kind === 'redirect') bad.final_url = 'https://attacker.test/fatwas/12/example';
      if (kind === 'format') bad.format = 'html';
      if (kind === 'size') bad.text = 'ن'.repeat(30_001);
      if (kind === 'title') bad.title = null;
      if (kind === 'html') bad.text = '<!DOCTYPE html><html><body>' + original + '</body></html>';
      if (kind === 'error-title') bad.title = '403 Forbidden';
      if (kind === 'not-modified') bad.not_modified = true;
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(response({ results: [{ url }] }))
        .mockResolvedValueOnce(response({ results: [bad], errors: [] }));
      const result = await createTinyfishWebDiscovery(options(fetch)).discover('اختبار');
      expect(result.snapshots).toEqual([]);
      expect(result.failures).toHaveLength(1);
    },
  );

  it('checks per-URL errors even with HTTP 200 and never retries', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ results: [{ url }] }))
      .mockResolvedValueOnce(
        response({
          results: [],
          errors: [{ url, error: 'bot_blocked', details: 'secret upstream body' }],
        }),
      );
    const result = await createTinyfishWebDiscovery(options(fetch)).discover('اختبار');
    expect(result).toMatchObject({ snapshots: [], failures: ['discovery_source_bot_blocked'] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not acquire URLs excluded by policy', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      response({
        results: [
          { url: 'https://127.0.0.1/fatwas/1' },
          { url: 'https://binbaz.org.sa/fatwas/12/example?redirect=elsewhere' },
        ],
      }),
    );
    const result = await createTinyfishWebDiscovery(options(fetch)).discover('اختبار');
    expect(result.snapshots).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a hung fetch and cancellation without retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const result = await createTinyfishWebDiscovery({ ...options(fetch), timeoutMs: 20 }).discover(
      'اختبار',
    );
    expect(result.failures).toEqual(['discovery_timeout_or_cancelled']);
    expect(fetch).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await createTinyfishWebDiscovery(options(fetch)).discover('اختبار', controller.signal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized provider streams while keeping cancellation cleanup bounded', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_001));
      },
      cancel() {
        return new Promise(() => undefined);
      },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(stream, { headers: { 'content-type': 'application/json' } }),
    );
    const result = await createTinyfishWebDiscovery({ ...options(fetch), timeoutMs: 20 }).discover(
      'اختبار',
    );
    expect(result.failures).toEqual(['discovery_body_too_large']);
  });

  it('freezes policy and attaches pending source evidence without inventing origin metadata', async () => {
    const policy = parseSourcePolicy(data);
    const hash = policy.sha256;
    const fetch = goodFetch();
    const discovery = createTinyfishGapDiscovery({ apiKey: 'fixture-secret', policy, fetch });
    policy.enabled.find((p) => p.domain === 'binbaz.org.sa')!.sourceRole = 'book_excerpt';
    const result = await discovery.discover({} as never, {
      reason: 'not_established',
      query: 'اختبار',
    });
    expect(result.evidence[0]).toMatchObject({
      originalText: original,
      sourceRole: 'scholar_explanation',
      sourceVersion: 'tinyfish-markdown:' + createHash('sha256').update(original).digest('hex'),
      approvalStatus: 'pending',
      researchOnly: true,
      provenance: {
        provider: 'tinyfish',
        originMetadataStatus: 'not_exposed_by_provider',
        sourcePolicySha256: hash,
        sourceEligibilityBasis: 'owner_selected',
        scholarlyApproval: false,
      },
    });
  });

  it('does not dispatch for a disabled policy', async () => {
    const input = structuredClone(data);
    input.sources.forEach((p) => (p.enabled = false));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const discovery = createTinyfishGapDiscovery({
      apiKey: '',
      policy: parseSourcePolicy(input),
      fetch,
    });
    expect(
      await discovery.discover({} as never, { reason: 'not_established', query: 'اختبار' }),
    ).toEqual({ evidence: [], failureCodes: ['discovery_policy_disabled'] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
