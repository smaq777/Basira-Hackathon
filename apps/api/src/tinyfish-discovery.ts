import { createHash } from 'node:crypto';
import type { ClaimGapDiscovery } from './claim-retrieval.js';
import { SourceEvidenceSchema } from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';
import type { LoadedSourcePolicy } from './source-policy.js';
import { allowedWebUrl, type WebDiscoverySnapshot, type WebSourcePolicy } from './web-discovery.js';

/** A provider extraction candidate, not a canonical edition or approval. */
export interface TinyfishSnapshot extends Omit<WebDiscoverySnapshot, 'provider'> {
  provider: 'tinyfish';
  originMetadataStatus: 'not_exposed_by_provider';
}
export interface TinyfishDiscoveryResult {
  snapshots: TinyfishSnapshot[];
  failures: string[];
  searchResults: number;
  durationMs: number;
}
interface AcquisitionOptions {
  apiKey: string;
  policies: readonly WebSourcePolicy[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxPages?: number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('discovery_invalid_response');
  return value as Record<string, unknown>;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('discovery_timeout_or_cancelled'));
    if (signal.aborted) {
      void promise.catch(() => undefined);
      return abort();
    }
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
  const chunks: Uint8Array[] = [];
  let size = 0;
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
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
function failure(error: unknown, fallback: string): string {
  return error instanceof Error && /^discovery_[a-z_0-9]+$/u.test(error.message)
    ? error.message
    : fallback;
}
const SOURCE_ERRORS = new Set([
  'target_http_error',
  'page_not_found',
  'target_unreachable',
  'timeout',
  'bot_blocked',
  'empty_content',
  'login_required',
  'content_too_large',
  'invalid_url',
  'invalid_redirect_url',
  'proxy_error',
  'conditional_unsupported',
  'selector_not_matched',
  'selector_unsupported',
]);

/** Standalone candidate: construction does not enable or call a runtime provider. */
export function createTinyfishWebDiscovery(options: AcquisitionOptions) {
  const policies = structuredClone(options.policies);
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
    !policies.length ||
    policies.length > 10 ||
    policies.some(
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
        (row.includeTags &&
          (row.includeTags.length > 20 ||
            row.includeTags.some((tag) => !tag.trim() || tag.length > 200))),
    )
  )
    throw new Error('discovery_invalid_configuration');
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async discover(query: string, external?: AbortSignal): Promise<TinyfishDiscoveryResult> {
      if (!query.trim() || query.length > 3000) throw new Error('discovery_invalid_query');
      const started = Date.now();
      const signal = AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(external ? [external] : []),
      ]);
      const result: TinyfishDiscoveryResult = {
        snapshots: [],
        failures: [],
        searchResults: 0,
        durationMs: 0,
      };
      const request = async (url: string, body?: unknown) => {
        signal.throwIfAborted();
        const response = await abortable(
          fetcher(url, {
            method: body === undefined ? 'GET' : 'POST',
            redirect: 'error',
            signal,
            headers: { 'X-API-Key': options.apiKey, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
          signal,
        );
        return record(await jsonBody(response, signal));
      };
      try {
        // Only validated result URLs are retained; snippets never become evidence.
        const search = new URL('https://api.search.tinyfish.ai');
        search.search = new URLSearchParams({
          query,
          include_domains: policies.map((p) => p.domain).join(','),
          language: 'ar',
          location: 'SA',
          domain_type: 'web',
          page: '0',
        }).toString();
        const searched = await request(search.href);
        if (!Array.isArray(searched.results)) throw new Error('discovery_invalid_results');
        result.searchResults = searched.results.length;
        const selected = new Map<string, URL>();
        for (const item of searched.results.slice(0, 5)) {
          const row = record(item);
          const url = typeof row.url === 'string' ? allowedWebUrl(row.url, policies) : null;
          if (!url) {
            result.failures.push('discovery_url_excluded');
            continue;
          }
          selected.set(url.href, url);
        }
        for (const url of [...selected.values()].slice(0, maxPages)) {
          try {
            const remaining = timeoutMs - (Date.now() - started);
            if (remaining < 1) throw new Error('discovery_timeout_or_cancelled');
            const rule = policies.find((p) => p.domain === url.hostname)!;
            const fetched = await request('https://api.fetch.tinyfish.ai', {
              urls: [url.href],
              format: 'markdown',
              ttl: 0,
              links: false,
              image_links: false,
              per_url_timeout_ms: Math.min(15_000, remaining),
              ...(rule.includeTags?.length ? { include_selectors: rule.includeTags } : {}),
            });
            if (!Array.isArray(fetched.results) || !Array.isArray(fetched.errors))
              throw new Error('discovery_invalid_response');
            if (fetched.errors.length) {
              if (fetched.errors.length !== 1 || fetched.results.length)
                throw new Error('discovery_invalid_response');
              const error = record(fetched.errors[0]);
              if (error.url !== url.href) throw new Error('discovery_destination_mismatch');
              throw new Error(
                SOURCE_ERRORS.has(String(error.error))
                  ? `discovery_source_${error.error}`
                  : 'discovery_source_unavailable',
              );
            }
            if (fetched.results.length !== 1) throw new Error('discovery_invalid_response');
            const page = record(fetched.results[0]);
            const origin = typeof page.url === 'string' ? allowedWebUrl(page.url, policies) : null;
            const final =
              typeof page.final_url === 'string' ? allowedWebUrl(page.final_url, policies) : null;
            if (
              !origin ||
              !final ||
              origin.href !== url.href ||
              final.hostname !== url.hostname ||
              final.pathname.split('/').slice(0, 3).join('/') !==
                url.pathname.split('/').slice(0, 3).join('/')
            )
              throw new Error('discovery_destination_mismatch');
            if (
              page.format !== 'markdown' ||
              page.not_modified === true ||
              page.error !== undefined
            )
              throw new Error('discovery_source_unavailable');
            if (typeof page.title !== 'string' || !page.title.trim() || page.title.length > 300)
              throw new Error('discovery_source_identity');
            if (
              typeof page.text !== 'string' ||
              page.text.trim().length < 40 ||
              page.text.length > 30_000
            )
              throw new Error('discovery_source_size');
            // Reject obvious challenge/error documents; this is not a fidelity proof.
            if (
              /^(?:\s*<!doctype\s+html|\s*<html\b)/iu.test(page.text) ||
              /^(?:access denied|forbidden|not found|error\b|(?:403|404|500)\b|الصفحة غير موجودة)/iu.test(
                page.title.trim(),
              )
            )
              throw new Error('discovery_source_unavailable');
            result.snapshots.push({
              requestedUrl: url.href,
              sourceUrl: final.href,
              title: page.title,
              originalMarkdown: page.text,
              originalSha256: createHash('sha256').update(page.text).digest('hex'),
              retrievedAt: new Date().toISOString(),
              provider: 'tinyfish',
              representation: 'extracted_markdown',
              approvalStatus: 'pending',
              researchOnly: true,
              originMetadataStatus: 'not_exposed_by_provider',
            });
          } catch (error) {
            result.failures.push(failure(error, 'discovery_acquisition_failed'));
            if (signal.aborted) break;
          }
        }
      } catch (error) {
        result.failures.push(failure(error, 'discovery_search_failed'));
      }
      result.durationMs = Date.now() - started;
      return result;
    },
  };
}

/** Optional research provider. No server flag or automatic fallback is enabled here. */
export function createTinyfishGapDiscovery(options: {
  apiKey: string;
  policy: LoadedSourcePolicy;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): ClaimGapDiscovery {
  const policy = structuredClone(options.policy);
  const acquisition = policy.policies.length
    ? createTinyfishWebDiscovery({
        apiKey: options.apiKey,
        policies: policy.policies,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 8000,
        maxPages: 2,
      })
    : undefined;
  return {
    async discover(_claim, gap, signal) {
      if (!acquisition) return { evidence: [], failureCodes: ['discovery_policy_disabled'] };
      const result = await acquisition.discover(gap.query, signal);
      return {
        failureCodes: result.failures,
        evidence: result.snapshots.map((snapshot) => {
          const rule = policy.enabled.find(
            (p) => p.domain === new URL(snapshot.sourceUrl).hostname,
          )!;
          return SourceEvidenceSchema.parse({
            snapshotKey: 'web:' + sha256(snapshot.sourceUrl + ':' + snapshot.originalSha256),
            sourceId: 'web-' + rule.id,
            sourceVersion: 'tinyfish-markdown:' + snapshot.originalSha256,
            sourceRole: rule.sourceRole,
            reference: snapshot.title,
            originalText: snapshot.originalMarkdown,
            originalSha256: snapshot.originalSha256,
            work: snapshot.title,
            author: null,
            edition: null,
            sourceUrl: snapshot.sourceUrl,
            approvalStatus: 'pending',
            researchOnly: true,
            parentSnapshotKey: null,
            delivery: 'live',
            retrievalModes: ['lexical'],
            provenance: {
              provider: 'tinyfish',
              representation: 'extracted_markdown',
              acquiredAt: snapshot.retrievedAt,
              requestedUrl: snapshot.requestedUrl,
              originMetadataStatus: snapshot.originMetadataStatus,
              sourcePolicyVersion: policy.policy.policyVersion,
              sourcePolicySha256: policy.sha256,
              sourceEligibilityBasis: rule.basis,
              referenceDocument: policy.policy.referenceDocument,
              gapReason: gap.reason,
              querySha256: sha256(gap.query),
              attributionStatus: 'page_title_only',
              rightsStatus: 'pending',
              scholarlyApproval: false,
              sourceApprovalMeaning:
                'Pending digital edition review; allowlist eligibility is separate.',
            },
          });
        }),
      };
    },
  };
}
