import { describe, it, expect } from 'vitest';
import { semanticBudgetConfiguration } from '../apps/api/src/semantic-budget.js';
describe('explicit research time profile', () => {
  it('keeps original defaults and permits the authorized extended bounded profile', () => {
    expect(semanticBudgetConfiguration({}, false)).toEqual({
      overallTimeoutMs: 60000,
      extractionTimeoutMs: 12000,
      assessmentTimeoutMs: 45000,
      gapDiscoveryTimeoutMs: 8000,
      gapAssessmentTimeoutMs: 18000,
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
    });
  });
  it('rejects production extension, malformed/unbounded inputs and insufficient durable deadlines', () => {
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
