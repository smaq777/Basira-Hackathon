import { describe, expect, it, vi } from 'vitest';
import { createCompositeGapDiscovery } from '../apps/api/src/composite-gap-discovery.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { ClaimGapDiscovery } from '../apps/api/src/claim-retrieval.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';

const gap = { reason: 'not_established' as const, query: 'owned fixture query' };
const source = (
  id: string,
  text = 'Owned fixture with a condition and enough full original context.',
): SourceEvidence => ({
  snapshotKey: 'web-' + id + '-' + sha256(text),
  sourceId: 'owned-source',
  sourceVersion: 'owned-v1',
  sourceRole: 'scholar_explanation',
  reference: 'Owned source',
  originalText: text,
  originalSha256: sha256(text),
  work: 'Owned work',
  author: null,
  edition: null,
  sourceUrl: 'https://binbaz.org.sa/fatwas/' + id,
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'live',
  retrievalModes: ['lexical'],
  provenance: {
    provider: 'fixture',
    scholarlyApproval: false,
    representation: 'extracted_markdown',
  },
});
const provider = (evidence: SourceEvidence[], failureCodes: string[] = []): ClaimGapDiscovery => ({
  discover: vi.fn(async () => ({ evidence, failureCodes })),
});

describe('bounded TinyFish-first composition', () => {
  it('does not call fallback when two primary pages pass validation', async () => {
    const primary = provider([source('1'), source('2')]);
    const fallback = provider([source('3')]);
    const result = await createCompositeGapDiscovery({ primary, fallback }).discover(
      {} as never,
      gap,
    );
    expect(result.evidence).toHaveLength(2);
    expect(fallback.discover).not.toHaveBeenCalled();
  });

  it('preserves primary failures and keeps the first original for the same URL', async () => {
    const first = source('1');
    const primary = provider([first], ['discovery_source_timeout']);
    const fallback = provider([
      source('1', 'Different provider representation of the same page.'),
      source('2'),
    ]);
    const result = await createCompositeGapDiscovery({ primary, fallback }).discover(
      {} as never,
      gap,
    );
    expect(result.evidence).toEqual([first, source('2')]);
    expect(result.failureCodes).toEqual(['discovery_source_timeout']);
  });

  it('retains a primary page if fallback fails and strips uncontrolled error details', async () => {
    const primary = provider([source('1')]);
    const fallback: ClaimGapDiscovery = {
      discover: vi.fn(async () => {
        throw new Error('upstream credential SECRET');
      }),
    };
    const result = await createCompositeGapDiscovery({ primary, fallback }).discover(
      {} as never,
      gap,
    );
    expect(result.evidence).toEqual([source('1')]);
    expect(result.failureCodes).toEqual(['discovery_provider_unavailable']);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('rejects bad source hashes and invented approval before counting pages', async () => {
    const bad = source('1');
    bad.originalSha256 = sha256('changed');
    const approved = source('2');
    approved.approvalStatus = 'approved';
    const primary = provider([bad, approved]);
    const fallback = provider([source('3')]);
    const result = await createCompositeGapDiscovery({ primary, fallback }).discover(
      {} as never,
      gap,
    );
    expect(result.evidence).toEqual([source('3')]);
    expect(result.failureCodes).toEqual(['discovery_invalid_source', 'discovery_invalid_source']);
  });

  it('caps failure codes and final unique pages', async () => {
    const primary = provider([], Array(20).fill('discovery_url_excluded'));
    const fallback = provider([source('1'), source('2'), source('3')], ['discovery_http_429']);
    const result = await createCompositeGapDiscovery({ primary, fallback }).discover(
      {} as never,
      gap,
    );
    expect(result.evidence).toHaveLength(2);
    expect(result.failureCodes).toHaveLength(9);
  });

  it('caps every failure code at the 100-character contract boundary', async () => {
    const boundary = 'discovery_' + 'a'.repeat(90);
    const primary = provider([], [boundary, boundary + 'a']);
    const result = await createCompositeGapDiscovery({ primary }).discover({} as never, gap);
    expect(result.failureCodes).toEqual([boundary, 'discovery_provider_unavailable']);
  });

  it('lets a cooperative primary return an acquired page after the child timeout', async () => {
    const primary: ClaimGapDiscovery = {
      discover: vi.fn(
        async (_claim, _gap, signal) =>
          new Promise<{ evidence: SourceEvidence[]; failureCodes: string[] }>((resolve) =>
            signal!.addEventListener(
              'abort',
              () =>
                resolve({
                  evidence: [source('1')],
                  failureCodes: ['discovery_timeout_or_cancelled'],
                }),
              { once: true },
            ),
          ),
      ),
    };
    const fallback = provider([source('2')]);
    const result = await createCompositeGapDiscovery({
      primary,
      fallback,
      timeoutMs: 200,
      stageTimeoutMs: 10,
    }).discover({} as never, gap);
    expect(result.evidence).toEqual([source('1'), source('2')]);
    expect(result.failureCodes).toEqual(['discovery_timeout_or_cancelled']);
  });

  it('bounds an uncooperative primary and still uses the remaining fallback time', async () => {
    const primary: ClaimGapDiscovery = {
      discover: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const fallback = provider([source('2')]);
    const result = await createCompositeGapDiscovery({
      primary,
      fallback,
      timeoutMs: 200,
      stageTimeoutMs: 10,
    }).discover({} as never, gap);
    expect(result.evidence).toEqual([source('2')]);
    expect(result.failureCodes).toEqual(['discovery_timeout_or_cancelled']);
  });

  it('does not dispatch after external cancellation or outlive the combined deadline', async () => {
    const primary: ClaimGapDiscovery = {
      discover: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const fallback = provider([source('2')]);
    const controller = new AbortController();
    controller.abort();
    const discovery = createCompositeGapDiscovery({
      primary,
      fallback,
      timeoutMs: 20,
      stageTimeoutMs: 10,
    });
    await discovery.discover({} as never, gap, controller.signal);
    expect(primary.discover).not.toHaveBeenCalled();
    const result = await discovery.discover({} as never, gap);
    expect(result.evidence).toEqual([]);
    expect(fallback.discover).not.toHaveBeenCalled();
    expect(result.failureCodes).toContain('discovery_timeout_or_cancelled');
  });
});
