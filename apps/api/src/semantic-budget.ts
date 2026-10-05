export const DEFAULT_SEMANTIC_TIMEOUT_MS = 60_000;
export const MAX_RESEARCH_SEMANTIC_TIMEOUT_MS = 240_000;
/** Explicit operator budgets; longer waits do not establish source coverage or correctness. */
export function semanticBudgetConfiguration(
  environment: Record<string, string | undefined>,
  researchPreview: boolean,
) {
  const read = (name: string, fallback: number, maximum: number) => {
    const value = environment[name] === undefined ? fallback : Number(environment[name]);
    if (!Number.isInteger(value) || value < 1 || value > maximum)
      throw new Error('INVALID_SEMANTIC_BUDGET_CONFIGURATION');
    return value;
  };
  const overallTimeoutMs = read(
    'FOUNDATION_SEMANTIC_TIMEOUT_MS',
    60000,
    researchPreview ? 240000 : 60000,
  );
  const assessmentTimeoutMs = read(
    'FOUNDATION_ASSESSMENT_TIMEOUT_MS',
    45000,
    researchPreview ? 90000 : 45000,
  );
  const extractionTimeoutMs = read(
    'FOUNDATION_EXTRACTION_TIMEOUT_MS',
    12000,
    researchPreview ? 20000 : 12000,
  );
  const gapDiscoveryTimeoutMs = read(
    'FOUNDATION_WEB_DISCOVERY_TIMEOUT_MS',
    8000,
    researchPreview ? 65000 : 8000,
  );
  const gapAssessmentTimeoutMs = read(
    'FOUNDATION_GAP_ASSESSMENT_TIMEOUT_MS',
    18000,
    researchPreview ? 45000 : 20000,
  );
  const reviewDeadlineSeconds = read('REVIEW_DEADLINE_SECONDS', 60, 300);
  if (
    reviewDeadlineSeconds < 5 ||
    (overallTimeoutMs > 60000 && reviewDeadlineSeconds * 1000 < overallTimeoutMs + 30000)
  )
    throw new Error('SEMANTIC_BUDGET_EXCEEDS_REVIEW_DEADLINE');
  return {
    overallTimeoutMs,
    extractionTimeoutMs,
    assessmentTimeoutMs,
    gapDiscoveryTimeoutMs,
    gapAssessmentTimeoutMs,
  };
}
