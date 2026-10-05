import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { sourceExtractionFailure } from '../apps/api/src/source-extraction-quality.js';
import { createTinyfishWebDiscovery } from '../apps/api/src/tinyfish-discovery.js';
import { createWebDiscovery } from '../apps/api/src/web-discovery.js';
import { createResearchPageCache } from '../apps/api/src/research-page-cache.js';
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';

const url = 'https://dorar.net/hadith/sharh/123';
// Owned synthetic reviewer-only fixture; no actual hadith is reproduced.
const navigation =
  '# منهج العمل في الموسوعة\r\n\r\nراجع الموسوعة\r\nالشيخ الدكتور اسم تجريبي\r\nأستاذ التفسير بجامعة اختبار\r\nاعتمد المنهجية\r\nبالإضافة إلى المراجعَين';
const article = 'شرح تجريبي مستقل يتضمن شرطا واستثناء ولا يقتصر على أسماء المراجعين.';
const policies = [{ domain: 'dorar.net', pathPrefixes: ['/hadith/'] }];
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const policy = parseSourcePolicy({
  schemaVersion: 1,
  policyVersion: 'owned-v1',
  referenceDocument: { name: 'Owned fixture', sha256: 'a'.repeat(64), pages: [] },
  deniedDomains: [],
  sources: [
    {
      id: 'dorar',
      ...policies[0],
      excludedPrefixes: [],
      enabled: true,
      basis: 'owner_selected',
      documentPages: [],
      sourceRole: 'scholar_explanation',
      notes: 'Owned fixture.',
    },
  ],
});
const evidence = (text: string, cached = false): SourceEvidence => ({
  snapshotKey: (cached ? 'web-cache:' : 'web:') + sha256(text),
  sourceId: 'web-dorar',
  sourceVersion: 'owned-v1',
  sourceRole: 'scholar_explanation',
  reference: 'Owned article',
  originalText: text,
  originalSha256: sha256(text),
  work: 'Owned fixture',
  author: null,
  edition: null,
  sourceUrl: url,
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'snapshot',
  retrievalModes: ['lexical'],
  provenance: {
    sourcePolicySha256: policy.sha256,
    sourcePolicyVersion: policy.policy.policyVersion,
  },
});

describe('article-missing extraction guard', () => {
  it('rejects reviewer-only Dorar explanations, including Markdown headings and vocalization', () => {
    expect(sourceExtractionFailure(url, navigation)).toBe('discovery_source_article_missing');
  });
  it('retains real article content even when the same footer follows it', () => {
    expect(sourceExtractionFailure(url, article + '\n' + navigation)).toBeNull();
  });
  it.each(['https://dorar.net/about', 'https://example.com/hadith/sharh/123', 'not-a-url'])(
    'does not make completeness claims for other destinations: %s',
    (other) => {
      expect(sourceExtractionFailure(other, navigation)).toBeNull();
    },
  );
  it.each(['tinyfish', 'firecrawl'] as const)(
    'rejects %s extraction before it becomes source evidence',
    async (provider) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      if (provider === 'tinyfish') {
        fetch.mockResolvedValueOnce(json({ results: [{ url }] })).mockResolvedValueOnce(
          json({
            results: [
              {
                url,
                final_url: url,
                format: 'markdown',
                title: 'Owned explanation',
                text: navigation,
              },
            ],
            errors: [],
          }),
        );
      } else {
        fetch
          .mockResolvedValueOnce(json({ success: true, data: { web: [{ url }] } }))
          .mockResolvedValueOnce(
            json({
              success: true,
              data: {
                markdown: navigation,
                metadata: {
                  url,
                  sourceURL: url,
                  title: 'Owned explanation',
                  statusCode: 200,
                  contentType: 'text/html',
                },
              },
            }),
          );
      }
      const factory = provider === 'tinyfish' ? createTinyfishWebDiscovery : createWebDiscovery;
      const result = await factory({ apiKey: 'owned-fixture', policies, fetch }).discover(
        'owned query',
      );
      expect(result.snapshots).toEqual([]);
      expect(result.failures).toEqual(['discovery_source_article_missing']);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('rejects cache admission before classification, embedding or database writes', async () => {
    const connect = vi.fn(),
      classify = vi.fn(),
      embed = vi.fn();
    const pool = { connect } as unknown as Pool;
    const cache = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify,
      embeddingSpace: { modelId: 'owned', embed },
    });
    await expect(cache.store([evidence(navigation)])).rejects.toThrow('CACHE_SOURCE_INELIGIBLE');
    expect(connect).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });
  it('filters previously cached navigation without losing other valid originals', async () => {
    const good = evidence(article + '\n' + navigation, true),
      bad = evidence(navigation, true);
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('select evidence')
        ? [bad, good].map((e) => ({ evidence: e, lexical_hit: true, semantic_hit: false }))
        : [],
    }));
    const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const cache = createResearchPageCache({
      readerPool: pool,
      writerPool: pool,
      policy,
      classify: vi.fn(),
    });
    const restored = await cache.restore([bad.snapshotKey, good.snapshotKey]);
    const found = await cache.search('owned article');
    expect(restored).toEqual([good]);
    expect(found).toEqual([good]);
    expect(found[0]!.originalText).toBe(article + '\n' + navigation);
    expect(query.mock.calls.some(([sql]) => /^(?:insert|update|delete)/u.test(sql))).toBe(false);
  });
});
