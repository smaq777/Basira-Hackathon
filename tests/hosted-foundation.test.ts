import { expect, it } from 'vitest';
import {
  createHostedDraftAdapter,
  foundationRuntimeMode,
} from '../apps/api/src/hosted-foundation.js';
import { sha256 } from '../apps/api/src/foundation.js';

const revisionId = '33333333-3333-4333-8333-333333333333';

it('keeps the local research preview and hosted demo mutually exclusive', () => {
  expect(
    foundationRuntimeMode(
      { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true' },
      '127.0.0.1',
    ),
  ).toBe('local_research');
  expect(
    foundationRuntimeMode({
      FOUNDATION_ENABLED: 'true',
      FOUNDATION_HOSTED_DEMO: 'true',
      FOUNDATION_SEMANTIC_ENABLED: 'true',
      FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
      NODE_ENV: 'production',
    }),
  ).toBe('hosted_demo');
  expect(() =>
    foundationRuntimeMode({
      FOUNDATION_ENABLED: 'true',
      FOUNDATION_RESEARCH_PREVIEW: 'true',
      FOUNDATION_HOSTED_DEMO: 'true',
    }),
  ).toThrow('FOUNDATION_RUNTIME_MODE_CONFLICT');
});

it.each([
  'FOUNDATION_TAFSIR_LIVE',
  'FOUNDATION_WEB_DISCOVERY_ENABLED',
  'FOUNDATION_WEB_CACHE_ENABLED',
  'FOUNDATION_WEB_CACHE_PASSAGES_ENABLED',
  'FOUNDATION_REWRITE_ENABLED',
] as const)('keeps %s disabled in the hosted read-only demo', (key) => {
  expect(() =>
    foundationRuntimeMode({
      FOUNDATION_ENABLED: 'true',
      FOUNDATION_HOSTED_DEMO: 'true',
      FOUNDATION_SEMANTIC_ENABLED: 'true',
      FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
      [key]: 'true',
    }),
  ).toThrow('HOSTED_DEMO_REQUIRES_READ_ONLY_RETRIEVAL');
});

it('requires semantic claim retrieval in the hosted demo', () => {
  expect(() =>
    foundationRuntimeMode({ FOUNDATION_ENABLED: 'true', FOUNDATION_HOSTED_DEMO: 'true' }),
  ).toThrow('HOSTED_DEMO_REQUIRES_SEMANTIC_RETRIEVAL');
});

it('creates a bound research-only draft intake without inventing source matches', async () => {
  const adapter = createHostedDraftAdapter('corpus-v1');
  const text = '🙂 قال الكاتب: هذا استنتاج يحتاج إلى دليل موثق.';
  const intake = await adapter.analyze(text, revisionId);
  expect(intake).toMatchObject({
    revisionId,
    revisionSha256: sha256(text),
    corpusVersion: 'corpus-v1',
    originalText: text,
    researchOnly: true,
    evidence: [],
    quotationFindings: [],
    warnings: ['literal_source_index_unavailable_in_hosted_demo'],
  });
  expect(intake.segments).toHaveLength(1);
  expect(intake.segments[0]).toMatchObject({
    startOffset: 0,
    endOffset: text.length,
    codePointStart: 0,
    codePointEnd: Array.from(text).length,
    originalText: text,
    role: 'author_text',
    sourceKeys: [],
  });
  await adapter.close();
  await expect(adapter.analyze(text, revisionId)).rejects.toThrow('FOUNDATION_ABORTED');
});
