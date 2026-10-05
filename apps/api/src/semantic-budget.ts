export const DEFAULT_SEMANTIC_TIMEOUT_MS = 60_000;
export const MAX_RESEARCH_SEMANTIC_TIMEOUT_MS = 240_000;
/** Explicit operator budgets; longer waits do not establish source coverage or correctness. */
export function semanticBudgetConfiguration(
  environment: Record<string, string | undefined>,
  researchPreview: boolean,
) {
  const read = (name: string, fallback: number, maximum: number, minimum = 1) => {
    const value = environment[name] === undefined ? fallback : Number(environment[name]);
    if (!Number.isInteger(value) || value < minimum || value > maximum)
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
  const retrievalTimeoutMs = read(
    'FOUNDATION_RETRIEVAL_TIMEOUT_MS',
    12000,
    researchPreview ? 90000 : 12000,
  );
  const retrievalAssessmentReserveMs = read(
    'FOUNDATION_RETRIEVAL_ASSESSMENT_RESERVE_MS',
    0,
    researchPreview ? 90000 : 0,
    0,
  );
  const cacheTimeoutMs = read('FOUNDATION_CACHE_TIMEOUT_MS', 3000, researchPreview ? 30000 : 3000);
  const cacheEmbeddingTimeoutMs = read(
    'FOUNDATION_CACHE_QUERY_EMBEDDING_TIMEOUT_MS',
    1500,
    researchPreview ? 8000 : 1500,
  );
  const cacheSqlTimeoutMs = read(
    'FOUNDATION_CACHE_SQL_TIMEOUT_MS',
    5000,
    researchPreview ? 10000 : 5000,
  );
  const passageSqlTimeoutMs = read(
    'FOUNDATION_CACHE_PASSAGE_SQL_TIMEOUT_MS',
    1000,
    researchPreview ? 5000 : 1000,
  );
  const contentSqlTimeoutMs = read(
    'FOUNDATION_CACHE_CONTENT_SQL_TIMEOUT_MS',
    5000,
    researchPreview ? 10000 : 5000,
  );
  const corpusConnectionTimeoutMs = read(
    'FOUNDATION_CORPUS_CONNECTION_TIMEOUT_MS',
    5000,
    researchPreview ? 10000 : 5000,
  );
  const corpusPoolMax = read('FOUNDATION_CORPUS_POOL_MAX', 3, researchPreview ? 6 : 3);
  if (
    cacheTimeoutMs > retrievalTimeoutMs ||
    cacheEmbeddingTimeoutMs >= cacheTimeoutMs ||
    retrievalAssessmentReserveMs > assessmentTimeoutMs ||
    (retrievalAssessmentReserveMs > 0 &&
      extractionTimeoutMs + retrievalTimeoutMs + retrievalAssessmentReserveMs > overallTimeoutMs)
  )
    throw Error('INCOHERENT_RETRIEVAL_BUDGET_CONFIGURATION');
  // Historical defaults remain bounded but do not promise room for every SQL stage.
  // An explicitly extended cache profile must budget a cold connection and enabled stages.
  if (
    cacheTimeoutMs > 3000 &&
    cacheTimeoutMs <
      cacheEmbeddingTimeoutMs +
        corpusConnectionTimeoutMs +
        Math.max(
          cacheSqlTimeoutMs,
          environment.FOUNDATION_WEB_CACHE_PASSAGES_ENABLED === 'true' ? passageSqlTimeoutMs : 0,
        ) +
        (environment.FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED === 'true'
          ? contentSqlTimeoutMs
          : 0)
  )
    throw Error('INCOHERENT_RETRIEVAL_BUDGET_CONFIGURATION');
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
    retrievalTimeoutMs,
    retrievalAssessmentReserveMs,
    cacheTimeoutMs,
    cacheEmbeddingTimeoutMs,
    cacheSqlTimeoutMs,
    passageSqlTimeoutMs,
    contentSqlTimeoutMs,
    corpusConnectionTimeoutMs,
    corpusPoolMax,
  };
}
