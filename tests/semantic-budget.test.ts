import { describe, it, expect } from 'vitest';
import { semanticBudgetConfiguration } from '../apps/api/src/semantic-budget.js';
const retrievalDefaults = {
  retrievalTimeoutMs: 12000,
  retrievalAssessmentReserveMs: 0,
  cacheTimeoutMs: 3000,
  cacheEmbeddingTimeoutMs: 1500,
  cacheSqlTimeoutMs: 5000,
  passageSqlTimeoutMs: 1000,
  contentSqlTimeoutMs: 5000,
  corpusConnectionTimeoutMs: 5000,
  corpusPoolMax: 3,
};
describe('explicit research time profile', () => {
  it('keeps original defaults and permits the authorized extended bounded profile', () => {
    expect(semanticBudgetConfiguration({}, false)).toEqual({
      overallTimeoutMs: 60000,
      extractionTimeoutMs: 12000,
      assessmentTimeoutMs: 45000,
      gapDiscoveryTimeoutMs: 8000,
      gapAssessmentTimeoutMs: 18000,
      ...retrievalDefaults,
    });
    expect(
      semanticBudgetConfiguration(
        {
          FOUNDATION_SEMANTIC_TIMEOUT_MS: '240000',
          FOUNDATION_EXTRACTION_TIMEOUT_MS: '20000',
          FOUNDATION_ASSESSMENT_TIMEOUT_MS: '90000',
          FOUNDATION_WEB_DISCOVERY_TIMEOUT_MS: '65000',
          FOUNDATION_GAP_ASSESSMENT_TIMEOUT_MS: '45000',
          REVIEW_DEADLINE_SECONDS: '300',
        },
        true,
      ),
    ).toEqual({
      overallTimeoutMs: 240000,
      extractionTimeoutMs: 20000,
      assessmentTimeoutMs: 90000,
      gapDiscoveryTimeoutMs: 65000,
      gapAssessmentTimeoutMs: 45000,
      ...retrievalDefaults,
    });
  });
  it('rejects production extension, malformed/unbounded inputs and insufficient durable deadlines', () => {
    expect(() =>
      semanticBudgetConfiguration({ FOUNDATION_EXTRACTION_TIMEOUT_MS: '20000' }, false),
    ).toThrow();
    expect(() =>
      semanticBudgetConfiguration(
        { FOUNDATION_SEMANTIC_TIMEOUT_MS: '240000', REVIEW_DEADLINE_SECONDS: '240' },
        false,
      ),
    ).toThrow();
    for (const [key, value] of Object.entries({
      FOUNDATION_SEMANTIC_TIMEOUT_MS: '240001',
      FOUNDATION_EXTRACTION_TIMEOUT_MS: '20001',
      FOUNDATION_ASSESSMENT_TIMEOUT_MS: '90001',
      FOUNDATION_WEB_DISCOVERY_TIMEOUT_MS: '65001',
      FOUNDATION_GAP_ASSESSMENT_TIMEOUT_MS: '45001',
      REVIEW_DEADLINE_SECONDS: '301',
    }))
      expect(() => semanticBudgetConfiguration({ [key]: value }, true)).toThrow();
    expect(() =>
      semanticBudgetConfiguration(
        { FOUNDATION_SEMANTIC_TIMEOUT_MS: '240000', REVIEW_DEADLINE_SECONDS: '180' },
        true,
      ),
    ).toThrow('SEMANTIC_BUDGET_EXCEEDS_REVIEW_DEADLINE');
    expect(() =>
      semanticBudgetConfiguration({ FOUNDATION_WEB_DISCOVERY_TIMEOUT_MS: 'NaN' }, true),
    ).toThrow();
  });
});

it('requires explicit coherent research retrieval/cache/assessment room rather than extending only the overall deadline', () => {
  const profile = {
    FOUNDATION_SEMANTIC_TIMEOUT_MS: '240000',
    FOUNDATION_EXTRACTION_TIMEOUT_MS: '20000',
    FOUNDATION_ASSESSMENT_TIMEOUT_MS: '90000',
    FOUNDATION_RETRIEVAL_TIMEOUT_MS: '60000',
    FOUNDATION_RETRIEVAL_ASSESSMENT_RESERVE_MS: '90000',
    FOUNDATION_CACHE_TIMEOUT_MS: '20000',
    FOUNDATION_CACHE_QUERY_EMBEDDING_TIMEOUT_MS: '2000',
    FOUNDATION_CACHE_SQL_TIMEOUT_MS: '5000',
    FOUNDATION_CACHE_PASSAGE_SQL_TIMEOUT_MS: '3000',
    FOUNDATION_CACHE_CONTENT_SQL_TIMEOUT_MS: '5000',
    FOUNDATION_CORPUS_CONNECTION_TIMEOUT_MS: '5000',
    FOUNDATION_CORPUS_POOL_MAX: '6',
    FOUNDATION_WEB_CACHE_PASSAGES_ENABLED: 'true',
    FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED: 'true',
    REVIEW_DEADLINE_SECONDS: '300',
  };
  expect(semanticBudgetConfiguration(profile, true)).toMatchObject({
    retrievalTimeoutMs: 60000,
    retrievalAssessmentReserveMs: 90000,
    cacheTimeoutMs: 20000,
    corpusPoolMax: 6,
  });
  expect(() => semanticBudgetConfiguration(profile, false)).toThrow();
  expect(() =>
    semanticBudgetConfiguration({ ...profile, FOUNDATION_CACHE_TIMEOUT_MS: '10000' }, true),
  ).toThrow('INCOHERENT_RETRIEVAL_BUDGET_CONFIGURATION');
  expect(() =>
    semanticBudgetConfiguration({ ...profile, FOUNDATION_RETRIEVAL_TIMEOUT_MS: '10000' }, true),
  ).toThrow('INCOHERENT_RETRIEVAL_BUDGET_CONFIGURATION');
  expect(() =>
    semanticBudgetConfiguration({ ...profile, FOUNDATION_SEMANTIC_TIMEOUT_MS: '160000' }, true),
  ).toThrow('INCOHERENT_RETRIEVAL_BUDGET_CONFIGURATION');
  for (const [key, value] of Object.entries({
    FOUNDATION_RETRIEVAL_TIMEOUT_MS: '90001',
    FOUNDATION_CACHE_TIMEOUT_MS: '30001',
    FOUNDATION_CACHE_QUERY_EMBEDDING_TIMEOUT_MS: '8001',
    FOUNDATION_CACHE_SQL_TIMEOUT_MS: '10001',
    FOUNDATION_CACHE_PASSAGE_SQL_TIMEOUT_MS: '5001',
    FOUNDATION_CACHE_CONTENT_SQL_TIMEOUT_MS: '10001',
    FOUNDATION_CORPUS_CONNECTION_TIMEOUT_MS: '10001',
    FOUNDATION_CORPUS_POOL_MAX: '7',
  }))
    expect(() => semanticBudgetConfiguration({ [key]: value }, true)).toThrow();
});
