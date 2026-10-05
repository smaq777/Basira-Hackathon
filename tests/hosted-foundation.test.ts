import { expect, it } from 'vitest';
import {
  createHostedDraftAdapter,
  foundationRuntimeMode,
} from '../apps/api/src/hosted-foundation.js';
import { sha256 } from '../apps/api/src/foundation.js';

const revisionId = '33333333-3333-4333-8333-333333333333';
const hostedDemoEnvironment = {
  FOUNDATION_ENABLED: 'true',
  FOUNDATION_HOSTED_DEMO: 'true',
  FOUNDATION_SEMANTIC_ENABLED: 'true',
  FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
  NODE_ENV: 'production',
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  BASIRAH_DEPLOYMENT_ENVIRONMENT: 'staging',
  FOUNDATION_STAGING_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  RAILWAY_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  BASIRAH_DEPLOYMENT_REF: 'refs/heads/development',
  BASIRAH_DEPLOYMENT_SHA: '1'.repeat(40),
  RAILWAY_GIT_BRANCH: 'development',
  RAILWAY_GIT_COMMIT_SHA: '1'.repeat(40),
  DATABASE_TLS_MODE: 'require',
  FOUNDATION_CORPUS_TLS_MODE: 'verify-full',
} satisfies NodeJS.ProcessEnv;

it('keeps the local research preview and hosted demo mutually exclusive', () => {
  expect(
    foundationRuntimeMode(
      { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true' },
      '127.0.0.1',
    ),
  ).toBe('local_research');
  expect(foundationRuntimeMode(hostedDemoEnvironment)).toBe('hosted_demo');
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

it('binds the hosted demo to the accepted staging service, source and verified corpus TLS', () => {
  for (const environment of [
    { ...hostedDemoEnvironment, BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production' },
    { ...hostedDemoEnvironment, RAILWAY_SERVICE_ID: '00000000-0000-0000-0000-000000000000' },
    { ...hostedDemoEnvironment, RAILWAY_GIT_BRANCH: 'main' },
    { ...hostedDemoEnvironment, FOUNDATION_CORPUS_TLS_MODE: 'require' },
    { ...hostedDemoEnvironment, DATABASE_TLS_MODE: 'disable' },
  ])
    expect(() => foundationRuntimeMode(environment)).toThrow('HOSTED_DEMO_ENVIRONMENT_MISMATCH');
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
