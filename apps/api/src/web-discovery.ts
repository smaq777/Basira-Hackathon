import { createHash } from 'node:crypto';
import { sourceExtractionFailure } from './source-extraction-quality.js';

/** Research acquisition only. These snapshots are not source approvals or verdicts. */
export interface WebSourcePolicy {
  domain: string;
  pathPrefixes: readonly string[];
  excludedPrefixes?: readonly string[];
  includeTags?: readonly string[];
}
export interface WebDiscoverySnapshot {
  requestedUrl: string;
  sourceUrl: string;
  title: string;
  originalMarkdown: string;
  originalSha256: string;
  retrievedAt: string;
  provider: 'firecrawl';
  representation: 'extracted_markdown';
  approvalStatus: 'pending';
  researchOnly: true;
}
export interface WebDiscoveryResult {
  snapshots: WebDiscoverySnapshot[];
  failures: string[];
  searchResults: number;
  durationMs: number;
}
export const RESEARCH_WEB_POLICIES: readonly WebSourcePolicy[] = [
  { domain: 'binbaz.org.sa', pathPrefixes: ['/fatwas/'], includeTags: ['.fatwa'] },
  { domain: 'shamela.ws', pathPrefixes: ['/book/'], includeTags: ['.nass'] },
];

export function allowedWebUrl(value: string, policies: readonly WebSourcePolicy[]): URL | null {
  try {
    if (value.length > 1000 || /[\u0000-\u0020\\]/u.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search)
      return null;
    const path = decodeURIComponent(url.pathname);
    if (
      /[\\\u0000-\u0020]/u.test(path) ||
      /%[0-9a-f]{2}/iu.test(path) ||
      path.split('/').some((part) => part === '.' || part === '..')
    )
      return null;
    const policy = policies.find((row) => row.domain === url.hostname);
    if (
      !policy ||
      !policy.pathPrefixes.some(
        (prefix) =>
          path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'),
      ) ||
      policy.excludedPrefixes?.some(
        (prefix) =>
          path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'),
      )
    )
      return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('discovery_timeout_or_cancelled'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function jsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok) throw new Error(`discovery_http_${response.status}`);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('discovery_invalid_mime');
  if (!response.body) throw new Error('discovery_empty_body');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) throw new Error('discovery_body_too_large');
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    // A provider stream may ignore cancellation; cleanup must not outlive the bounded request.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('discovery_invalid_response');
  return value as Record<string, unknown>;
}

export function createWebDiscovery(options: {
  apiKey: string;
  policies: readonly WebSourcePolicy[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxPages?: number;
}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxPages = options.maxPages ?? 2;
  if (
    !options.apiKey.trim() ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 3 ||
    !options.policies.length ||
    options.policies.length > 10 ||
    options.policies.some(
      (row) =>
        !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/u.test(row.domain) ||
        !row.pathPrefixes.length ||
        row.pathPrefixes.length > 20 ||
        [...row.pathPrefixes, ...(row.excludedPrefixes ?? [])].some(
          (prefix) =>
            !prefix.startsWith('/') ||
            prefix.length > 1000 ||
            /[\\\u0000-\u0020?#%]/u.test(prefix) ||
            prefix.split('/').some((part) => part === '.' || part === '..'),
        ) ||
        (row.includeTags?.some((tag) => !tag.trim() || tag.length > 200) ?? false),
    )
  )
    throw new Error('discovery_invalid_configuration');
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async discover(query: string, external?: AbortSignal): Promise<WebDiscoveryResult> {
      if (!query.trim() || query.length > 3000) throw new Error('discovery_invalid_query');
      const started = Date.now();
      const signal = AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(external ? [external] : []),
      ]);
      const result: WebDiscoveryResult = {
        snapshots: [],
        failures: [],
        searchResults: 0,
        durationMs: 0,
      };
      const request = async (operation: 'search' | 'scrape', body: unknown) => {
        signal.throwIfAborted();
        const response = await abortable(
          fetcher(`https://api.firecrawl.dev/v2/${operation}`, {
            method: 'POST',
            redirect: 'error',
            signal,
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
          signal,
        );
        const payload = record(await jsonBody(response, signal));
        if (payload.success !== true) throw new Error('discovery_provider_failure');
        return record(payload.data);
      };
      try {
        // Snippets and highlights only discover URLs; they never become evidence.
        const searched = await request('search', {
          query,
          includeDomains: options.policies.map((row) => row.domain),
          limit: 5,
          sources: ['web'],
          domainTools: false,
        });
        if (!Array.isArray(searched.web)) throw new Error('discovery_invalid_results');
        result.searchResults = searched.web.length;
        const selected = new Map<string, URL>();
        for (const item of searched.web.slice(0, 5)) {
          const candidate = record(item);
          const url =
            typeof candidate.url === 'string'
              ? allowedWebUrl(candidate.url, options.policies)
              : null;
          if (!url) {
            result.failures.push('discovery_url_excluded');
            continue;
          }
          selected.set(url.href, url);
        }
        for (const url of [...selected.values()].slice(0, maxPages)) {
          try {
            const policy = options.policies.find((row) => row.domain === url.hostname)!;
            const scraped = await request('scrape', {
              url: url.href,
              formats: ['markdown'],
              onlyMainContent: true,
              ...(policy.includeTags ? { includeTags: policy.includeTags } : {}),
              maxAge: 0,
              timeout: Math.min(15_000, timeoutMs),
            });
            const metadata = record(scraped.metadata);
            const final =
              typeof metadata.url === 'string'
                ? allowedWebUrl(metadata.url, options.policies)
                : null;
            const origin =
              typeof metadata.sourceURL === 'string'
                ? allowedWebUrl(metadata.sourceURL, options.policies)
                : null;
            if (
              !final ||
              !origin ||
              origin.href !== url.href ||
              final.hostname !== url.hostname ||
              final.pathname.split('/').slice(0, 3).join('/') !==
                url.pathname.split('/').slice(0, 3).join('/')
            )
              throw new Error('discovery_destination_mismatch');
            if (
              metadata.statusCode !== 200 ||
              typeof metadata.contentType !== 'string' ||
              !/^text\/(html|plain)(?:;|$)/iu.test(metadata.contentType)
            )
              throw new Error('discovery_source_unavailable');
            if (
              typeof scraped.markdown !== 'string' ||
              scraped.markdown.trim().length < 40 ||
              scraped.markdown.length > 30_000
            )
              throw new Error('discovery_source_size');
            if (
              typeof metadata.title !== 'string' ||
              !metadata.title.trim() ||
              metadata.title.length > 300
            )
              throw new Error('discovery_source_identity');
            const qualityFailure = sourceExtractionFailure(final.href, scraped.markdown);
            if (qualityFailure) throw new Error(qualityFailure);
            result.snapshots.push({
              requestedUrl: url.href,
              sourceUrl: final.href,
              title: metadata.title,
              originalMarkdown: scraped.markdown,
              originalSha256: createHash('sha256').update(scraped.markdown).digest('hex'),
              retrievedAt: new Date().toISOString(),
              provider: 'firecrawl',
              representation: 'extracted_markdown',
              approvalStatus: 'pending',
              researchOnly: true,
            });
          } catch (error) {
            result.failures.push(
              error instanceof Error && /^discovery_[a-z_0-9]+$/u.test(error.message)
                ? error.message
                : 'discovery_acquisition_failed',
            );
            if (signal.aborted) break;
          }
        }
      } catch (error) {
        result.failures.push(
          error instanceof Error && /^discovery_[a-z_0-9]+$/u.test(error.message)
            ? error.message
            : 'discovery_search_failed',
        );
      }
      result.durationMs = Date.now() - started;
      return result;
    },
  };
}
