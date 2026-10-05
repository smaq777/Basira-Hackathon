import { describe, expect, it, vi } from 'vitest';
import data from '../config/source-policy.json' with { type: 'json' };
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import { allowedWebUrl } from '../apps/api/src/web-discovery.js';
import { createWebGapDiscovery } from '../apps/api/src/web-gap-discovery.js';
import { sha256 } from '../apps/api/src/foundation.js';

describe('operator source policy', () => {
  it('includes exactly the five document domains and keeps owner selection distinct', () => {
    const loaded = parseSourcePolicy(data);
    expect(
      loaded.enabled
        .filter((row) => row.basis === 'hackathon_listed')
        .map((row) => row.domain)
        .sort(),
    ).toEqual(['dawa.center', 'dorar.net', 'islamic-content.com', 'quranpedia.net', 'shamela.ws']);
    expect(loaded.enabled.find((row) => row.domain === 'binbaz.org.sa')?.basis).toBe(
      'owner_selected',
    );
    expect(allowedWebUrl('https://dorar.net/hadith/sharh/1', loaded.policies)).not.toBeNull();
    expect(allowedWebUrl('https://dorar.net/hadith-impersonation/1', loaded.policies)).toBeNull();
    expect(allowedWebUrl('https://dorar.net/unlisted/1', loaded.policies)).toBeNull();
  });
  it('denies a blocked or disabled domain before any acquisition', async () => {
    const policy = structuredClone(parseSourcePolicy(data).policy);
    policy.deniedDomains = ['dorar.net'];
    policy.sources.forEach((row) => (row.enabled = false));
    const loaded = parseSourcePolicy(policy),
      fetcher = vi.fn();
    const discovery = createWebGapDiscovery({ apiKey: 'fixture', policy: loaded, fetch: fetcher });
    const result = await discovery.discover({} as never, {
      reason: 'not_established',
      query: 'test',
    });
    expect(result.failureCodes).toEqual(['discovery_policy_disabled']);
    expect(fetcher).not.toHaveBeenCalled();
    expect(allowedWebUrl('https://dorar.net/hadith/1', loaded.policies)).toBeNull();
  });
  it('rejects malformed, ambiguous and unknown policy fields', () => {
    for (const change of [
      (p: any) => p.sources.push(p.sources[0]),
      (p: any) => (p.sources[0].pathPrefixes = ['/%2e%2e/']),
      (p: any) => (p.sources[0].domain = '*.example.com'),
      (p: any) => (p.sources[0].approvalStatus = 'approved'),
    ]) {
      const policy = structuredClone(data);
      change(policy);
      expect(() => parseSourcePolicy(policy)).toThrow();
    }
  });
  it('binds acquired page text to policy provenance without granting approval', async () => {
    const url = 'https://shamela.ws/book/123/4',
      original = 'Owned synthetic test source paragraph with a preserved qualification.';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { web: [{ url }] } }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: original,
              metadata: {
                url,
                sourceURL: url,
                statusCode: 200,
                contentType: 'text/html',
                title: 'Owned source',
              },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    const loaded = parseSourcePolicy(data),
      discovery = createWebGapDiscovery({ apiKey: 'fixture', policy: loaded, fetch: fetcher });
    const result = await discovery.discover({} as never, {
      reason: 'not_established',
      query: 'specific claim',
    });
    expect(result.evidence[0]).toMatchObject({
      originalText: original,
      originalSha256: sha256(original),
      sourceRole: 'book_excerpt',
      approvalStatus: 'pending',
      researchOnly: true,
      provenance: {
        sourcePolicySha256: loaded.sha256,
        sourceEligibilityBasis: 'hackathon_listed',
        scholarlyApproval: false,
      },
    });
    expect(result.evidence[0]?.sourceVersion).toContain(sha256(original));
  });
});

it('freezes the policy role and provenance for an already-created acquisition adapter', async () => {
  const loaded = parseSourcePolicy(data);
  const url = 'https://shamela.ws/book/123/4';
  const original =
    'An owned synthetic source with enough original context to validate acquisition.';
  const response = (payload: unknown) =>
    new Response(JSON.stringify({ success: true, data: payload }), {
      headers: { 'content-type': 'application/json' },
    });
  const fetcher = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ web: [{ url }] }))
    .mockResolvedValueOnce(
      response({
        markdown: original,
        metadata: {
          url,
          sourceURL: url,
          statusCode: 200,
          contentType: 'text/html',
          title: 'Owned source',
        },
      }),
    );
  const discovery = createWebGapDiscovery({ apiKey: 'fixture', policy: loaded, fetch: fetcher });
  loaded.enabled.find((row) => row.domain === 'shamela.ws')!.sourceRole = 'scholar_explanation';
  loaded.policy.policyVersion = 'mutated-after-creation';
  const result = await discovery.discover({} as never, {
    reason: 'not_established',
    query: 'specific gap',
  });
  expect(result.evidence[0]).toMatchObject({
    sourceRole: 'book_excerpt',
    provenance: { sourcePolicyVersion: data.policyVersion, sourcePolicySha256: loaded.sha256 },
  });
});
