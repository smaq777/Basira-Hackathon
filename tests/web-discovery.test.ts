import { describe, expect, it, vi } from 'vitest';
import {
  allowedWebUrl,
  createWebDiscovery,
  RESEARCH_WEB_POLICIES,
} from '../apps/api/src/web-discovery.js';

const URL = 'https://binbaz.org.sa/fatwas/12/example';
const original =
  'نص تجريبي مستقل للاختبار. هذا النص يذكر شرط الإذن ويستثني النسخ المحفوظة من الإعارة.';
const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
const source = () => ({
  markdown: original,
  metadata: {
    url: URL,
    sourceURL: URL,
    title: 'مصدر اختبار',
    statusCode: 200,
    contentType: 'text/html; charset=utf-8',
  },
});
const options = (fetch: typeof globalThis.fetch) => ({
  apiKey: 'test-only-secret',
  policies: RESEARCH_WEB_POLICIES,
  fetch,
});

describe('bounded experimental web discovery', () => {
  it.each([
    'http://binbaz.org.sa/fatwas/12/example',
    'https://binbaz.org.sa.attacker.test/fatwas/12/example',
    'https://binbaz.org.sa@attacker.test/fatwas/12/example',
    'https://binbaz.org.sa:444/fatwas/12/example',
    'https://binbaz.org.sa/fatwas/12/example?redirect=https://attacker.test',
    'https://127.0.0.1/fatwas/12/example',
    'https://binbaz.org.sa/fatwas/%252e%252e/private',
    'https://binbaz.org.sa/fatwas/%00hidden',
    'https://binbaz.org.sa/fatwas/12%2f..%2f..%2fprivate',
    'https://binbaz.org.sa/files/book.pdf',
  ])('excludes unsafe or unconfigured destination %s', (url) => {
    expect(allowedWebUrl(url, RESEARCH_WEB_POLICIES)).toBeNull();
  });

  it('applies exclusions after the allowlist and strips only fragments', () => {
    expect(allowedWebUrl(URL + '#footnote', RESEARCH_WEB_POLICIES)?.href).toBe(URL);
    expect(
      allowedWebUrl(URL, [
        { domain: 'binbaz.org.sa', pathPrefixes: ['/fatwas/'], excludedPrefixes: ['/fatwas/12/'] },
      ]),
    ).toBeNull();
  });

  it('uses search only for discovery, retaining attributed original markdown with pending status', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({
          web: [{ url: URL, description: 'invented search snippet' }, { url: URL + '#other' }],
        }),
      )
      .mockResolvedValueOnce(response(source()));
    const result = await createWebDiscovery(options(fetch)).discover('عبارة اختبار');
    expect(fetch).toHaveBeenCalledTimes(2);
    const searchBody = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(searchBody.includeDomains).toEqual(['binbaz.org.sa', 'shamela.ws']);
    expect(searchBody).not.toHaveProperty('scrapeOptions');
    expect(fetch.mock.calls[1]![1]?.redirect).toBe('error');
    expect(result.snapshots[0]).toMatchObject({
      originalMarkdown: original,
      sourceUrl: URL,
      approvalStatus: 'pending',
      researchOnly: true,
      representation: 'extracted_markdown',
    });
    expect(result.snapshots[0]!.originalSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result)).not.toContain('invented search snippet');
    expect(JSON.stringify(result)).not.toContain('test-only-secret');
  });

  it.each(['redirect', 'identity', 'mime', 'oversize', 'no-final-url'])(
    'rejects invalid scraped evidence: %s',
    async (kind) => {
      const body = source();
      if (kind === 'redirect') body.metadata.url = 'https://attacker.test/fatwas/12/example';
      if (kind === 'identity') body.metadata.sourceURL = 'https://binbaz.org.sa/fatwas/99/other';
      if (kind === 'mime') body.metadata.contentType = 'application/pdf';
      if (kind === 'oversize') body.markdown = 'ن'.repeat(30_001);
      if (kind === 'no-final-url') body.metadata.url = '';
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(response({ web: [{ url: URL }] }))
        .mockResolvedValueOnce(response(body));
      const result = await createWebDiscovery(options(fetch)).discover('عبارة اختبار');
      expect(result.snapshots).toEqual([]);
      expect(result.failures).toHaveLength(1);
    },
  );

  it('does not fetch excluded results or turn an outage into evidence', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ web: [{ url: 'https://attacker.test/page' }] }));
    expect((await createWebDiscovery(options(fetch)).discover('عبارة اختبار')).snapshots).toEqual(
      [],
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(new Response('upstream secret body', { status: 503 }));
    expect(await createWebDiscovery(options(fetch)).discover('عبارة اختبار')).toMatchObject({
      snapshots: [],
      failures: ['discovery_http_503'],
    });
  });

  it('bounds even a hung injected provider without retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const result = await createWebDiscovery({ ...options(fetch), timeoutMs: 20 }).discover(
      'عبارة اختبار',
    );
    expect(result.snapshots).toEqual([]);
    expect(result.failures).toEqual(['discovery_timeout_or_cancelled']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it('keeps body cancellation cleanup bounded when a provider stream ignores it', async () => {
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
  const result = await createWebDiscovery({ ...options(fetch), timeoutMs: 20 }).discover('عبارة');
  expect(result.failures).toEqual(['discovery_body_too_large']);
});

it('rejects ambiguous policy paths before requests', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  expect(() =>
    createWebDiscovery({
      ...options(fetch),
      policies: [{ domain: 'binbaz.org.sa', pathPrefixes: ['/fatwas/../private'] }],
    }),
  ).toThrow('discovery_invalid_configuration');
  expect(fetch).not.toHaveBeenCalled();
});
