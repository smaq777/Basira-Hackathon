import { semanticBudgetConfiguration } from './semantic-budget.js';
import { createApp } from './app.js';
import { createRewriteService } from './rewrite.js';
import { createRewriteGenerator } from './rewrite-provider.js';
import { createDatabase, databaseTls, DatabaseUnavailable } from './database.js';
import { Pool } from 'pg';
import { createClerkReviewerAuth } from './reviewer-auth.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createPythonAdapter } from './foundation.js';
import { createReviewStore } from './review-store.js';
import { createFoundationWorker } from './review-worker.js';
import { createSemanticAssessmentAdapter } from './semantic-assessment.js';
import { createHostedCorpus } from './hosted-corpus.js';
import { createClaimRetrievalAdapter } from './claim-retrieval.js';
import { loadSourcePolicy } from './source-policy.js';
import { createWebGapDiscovery } from './web-gap-discovery.js';
import { createResearchPageCache } from './research-page-cache.js';
import { createPageTopicClassifier } from './page-topic-classifier.js';
import { withResearchPageCache } from './cached-gap-discovery.js';
import { withResearchPageCorpus } from './cached-corpus.js';
import { createTinyfishGapDiscovery } from './tinyfish-discovery.js';
import { createCompositeGapDiscovery } from './composite-gap-discovery.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';
import {
  createOpenRouterQueryEmbedding,
  QUERY_EMBEDDING_MODEL,
  QUERY_EMBEDDING_DIMENSIONS,
} from './query-embedding.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const host = process.env.HOST ?? '0.0.0.0';
if (!['127.0.0.1', '0.0.0.0', '::1'].includes(host)) throw new Error('Invalid HOST');
const connectionString = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' && !connectionString)
  throw new Error('DATABASE_URL is required in production');
const database = connectionString ? createDatabase(connectionString) : new DatabaseUnavailable();
const reviewerAuth = createClerkReviewerAuth();
const clerkFrontendApiOrigin = process.env.CLERK_FRONTEND_API_ORIGIN?.trim();
if (reviewerAuth.configured !== Boolean(clerkFrontendApiOrigin))
  throw new Error(
    'CLERK_FRONTEND_API_ORIGIN must be configured exactly when Clerk reviewer authentication is enabled',
  );
async function initializeFoundation() {
  if (process.env.FOUNDATION_ENABLED !== 'true') return undefined;
  const researchPreview = process.env.FOUNDATION_RESEARCH_PREVIEW === 'true';
  if (
    researchPreview &&
    (process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1'].includes(host))
  )
    throw new Error('RESEARCH_PREVIEW_REQUIRES_LOCAL_DEVELOPMENT');
  // This opt-in uses only numeric verse references and the pinned Tafsir adapter.
  // Hosted activation needs separate source-edition and deployment validation.
  if (process.env.FOUNDATION_TAFSIR_LIVE === 'true' && !researchPreview)
    throw new Error('LIVE_SOURCE_ACQUISITION_REQUIRES_LOCAL_RESEARCH_PREVIEW');
  const semanticEnabled = process.env.FOUNDATION_SEMANTIC_ENABLED === 'true';
  const semanticBudget = semanticBudgetConfiguration(process.env, researchPreview);
  if (semanticEnabled && !researchPreview)
    throw new Error('SEMANTIC_PILOT_REQUIRES_LOCAL_RESEARCH_PREVIEW');
  const retrievalEnabled = process.env.FOUNDATION_CLAIM_RETRIEVAL_ENABLED === 'true';
  const webDiscoveryEnabled = process.env.FOUNDATION_WEB_DISCOVERY_ENABLED === 'true';
  const webCacheEnabled = process.env.FOUNDATION_WEB_CACHE_ENABLED === 'true';
  const webProvider = process.env.FOUNDATION_WEB_PROVIDER ?? 'firecrawl';
  if (!['firecrawl', 'tinyfish_first'].includes(webProvider))
    throw new Error('WEB_DISCOVERY_PROVIDER_INVALID');
  if (webCacheEnabled && !webDiscoveryEnabled) throw new Error('WEB_CACHE_REQUIRES_WEB_DISCOVERY');
  if (webDiscoveryEnabled && !retrievalEnabled)
    throw new Error('WEB_DISCOVERY_REQUIRES_CLAIM_RETRIEVAL');
  if (retrievalEnabled && !semanticEnabled)
    throw new Error('CLAIM_RETRIEVAL_REQUIRES_SEMANTIC_PIPELINE');
  const python = process.env.FOUNDATION_PYTHON;
  const sourceDatabase = process.env.FOUNDATION_DATABASE;
  const workerUrl = process.env.REVIEW_WORKER_DATABASE_URL;
  if (!connectionString || !python || !sourceDatabase || !workerUrl)
    throw new Error('FOUNDATION_CONFIGURATION_INCOMPLETE');
  const readiness = await database.readiness();
  if (
    !readiness.ready ||
    !(Number(readiness.migrationVersion?.slice(0, 4)) >= (retrievalEnabled ? 9 : 7))
  )
    throw new Error('FOUNDATION_MIGRATION_REQUIRED');
  const adapter = createPythonAdapter({
    python,
    script: resolve('apps/foundation_worker/intake_bridge.py'),
    cwd: resolve('apps/foundation_worker'),
    database: sourceDatabase,
    snapshotDirectory: process.env.FOUNDATION_SNAPSHOTS || undefined,
    researchPreview,
  });
  let corpusPool: Pool | undefined;
  let webCachePool: Pool | undefined;
  try {
    const intake = await adapter.analyze('تهيئة محرك المصادر المحلي.', randomUUID());
    const configured = process.env.CORPUS_VERSION?.trim();
    if (configured && configured !== 'unconfigured' && configured !== intake.corpusVersion)
      throw new Error('FOUNDATION_CORPUS_VERSION_MISMATCH');
    process.env.CORPUS_VERSION = intake.corpusVersion;
    const store = createReviewStore(workerUrl);
    const reports = createReviewStore(connectionString);
    let claimRetrieval;
    let baseCorpus: ClaimCorpusSearch | undefined;
    let selectedCorpusVersion: string | undefined;
    if (retrievalEnabled) {
      const configuredUrl = process.env.FOUNDATION_CORPUS_DATABASE_URL;
      const corpusVersion = process.env.FOUNDATION_CORPUS_VERSION?.trim();
      if (!configuredUrl || !corpusVersion) throw new Error('HOSTED_CORPUS_CONFIGURATION_REQUIRED');
      const corpusUrl = new URL(configuredUrl);
      if (!['postgres:', 'postgresql:'].includes(corpusUrl.protocol))
        throw new Error('HOSTED_CORPUS_URL_INVALID');
      corpusUrl.searchParams.delete('sslmode');
      corpusUrl.searchParams.delete('channel_binding');
      corpusPool = new Pool({
        connectionString: corpusUrl.toString(),
        ssl: databaseTls(process.env.FOUNDATION_CORPUS_TLS_MODE || 'verify-full'),
        max: 3,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      });
      const corpus = createHostedCorpus({
        pool: corpusPool,
        corpusVersion,
        researchPreview,
        embeddingSpace: {
          modelId: QUERY_EMBEDDING_MODEL,
          dimensions: QUERY_EMBEDDING_DIMENSIONS,
          embedQuery: createOpenRouterQueryEmbedding({
            apiKey: process.env.OPENROUTER_API_KEY ?? '',
          }),
        },
      });
      if (!(await corpus.readiness()).ready) throw new Error('HOSTED_CORPUS_NOT_READY');
      baseCorpus = corpus;
      selectedCorpusVersion = corpusVersion;
      claimRetrieval = createClaimRetrievalAdapter({
        corpus,
        corpusVersion,
        researchPreview,
        reserveDiscoveryKeys: webDiscoveryEnabled,
      });
    }
    let gapDiscovery;
    if (webDiscoveryEnabled) {
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) throw new Error('FIRECRAWL_CONFIGURATION_REQUIRED');
      const sourcePolicy = await loadSourcePolicy(
        process.env.FOUNDATION_WEB_POLICY_PATH || undefined,
      );
      gapDiscovery = createWebGapDiscovery({
        apiKey,
        policy: sourcePolicy,
        timeoutMs: Math.min(30_000, semanticBudget.gapDiscoveryTimeoutMs),
      });
      if (webProvider === 'tinyfish_first') {
        if (!process.env.TINYFISH_API_KEY) throw new Error('TINYFISH_CONFIGURATION_REQUIRED');
        gapDiscovery = createCompositeGapDiscovery({
          primary: createTinyfishGapDiscovery({
            apiKey: process.env.TINYFISH_API_KEY,
            policy: sourcePolicy,
            timeoutMs: Math.min(30_000, semanticBudget.gapDiscoveryTimeoutMs),
          }),
          fallback: gapDiscovery,
          timeoutMs: Math.min(30_000, semanticBudget.gapDiscoveryTimeoutMs),
        });
      }
      if (webCacheEnabled) {
        if (
          !corpusPool ||
          !process.env.FOUNDATION_WEB_CACHE_DATABASE_URL ||
          !process.env.OPENROUTER_API_KEY
        )
          throw new Error('WEB_CACHE_CONFIGURATION_REQUIRED');
        if (semanticBudget.gapDiscoveryTimeoutMs < 65_000)
          throw new Error('WEB_CACHE_REQUIRES_EXTENDED_DISCOVERY_BUDGET');
        const cacheUrl = new URL(process.env.FOUNDATION_WEB_CACHE_DATABASE_URL);
        if (!['postgres:', 'postgresql:'].includes(cacheUrl.protocol))
          throw new Error('WEB_CACHE_URL_INVALID');
        cacheUrl.searchParams.delete('sslmode');
        cacheUrl.searchParams.delete('channel_binding');
        webCachePool = new Pool({
          connectionString: cacheUrl.toString(),
          ssl: databaseTls(process.env.FOUNDATION_CORPUS_TLS_MODE || 'verify-full'),
          max: 2,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        });
        const cache = createResearchPageCache({
          readerPool: corpusPool,
          writerPool: webCachePool,
          policy: sourcePolicy,
          classify: createPageTopicClassifier({ apiKey: process.env.OPENROUTER_API_KEY }),
          embeddingSpace: {
            modelId: QUERY_EMBEDDING_MODEL,
            embed: createOpenRouterQueryEmbedding({ apiKey: process.env.OPENROUTER_API_KEY }),
          },
        });
        gapDiscovery = withResearchPageCache(gapDiscovery, cache, {
          timeoutMs: semanticBudget.gapDiscoveryTimeoutMs,
        });
        claimRetrieval = createClaimRetrievalAdapter({
          corpus: withResearchPageCorpus(baseCorpus!, cache),
          corpusVersion: selectedCorpusVersion!,
          researchPreview,
          reserveDiscoveryKeys: true,
        });
      }
    }
    const semantic = semanticEnabled
      ? createSemanticAssessmentAdapter({
          enabled: true,
          ...semanticBudget,
          apiKey: process.env.OPENROUTER_API_KEY,
          extractor: { modelId: 'openai/gpt-6-luna', providerId: 'OpenAI', reasoningEffort: 'low' },
          assessor: {
            modelId: process.env.FOUNDATION_ASSESSOR_MODEL || 'openai/gpt-6.1-sol',
            providerId: 'OpenAI',
            reasoningEffort: 'low',
          },
          allowedModels: ['openai/gpt-6-luna', 'openai/gpt-6.1-sol'],
          allowedProviders: ['OpenAI'],
          researchPreview,
          claimRetrieval,
          gapDiscovery,
        })
      : undefined;
    const worker = createFoundationWorker(adapter, store, semantic, {
      researchPreview,
      semanticTimeoutMs: semanticBudget.overallTimeoutMs,
    });
    return {
      worker,
      reports,
      researchPreview,
      liveTafsir: process.env.FOUNDATION_TAFSIR_LIVE === 'true',
      semanticPilot: semanticEnabled,
      webDiscovery: webDiscoveryEnabled,
      webProvider: webProvider as 'firecrawl' | 'tinyfish_first',
      corpusPool,
      webCachePool,
    };
  } catch (error) {
    await corpusPool?.end();
    await webCachePool?.end();
    await adapter.close();
    throw error;
  }
}
const foundation = await initializeFoundation().catch(async (error: unknown) => {
  await database.close();
  throw error;
});
const rewriteEnabled = process.env.FOUNDATION_REWRITE_ENABLED === 'true';
if (
  rewriteEnabled &&
  (!foundation?.researchPreview ||
    process.env.NODE_ENV === 'production' ||
    !['127.0.0.1', '::1'].includes(host))
)
  throw new Error('REWRITE_REQUIRES_LOCAL_RESEARCH_PREVIEW');
const rewrite = rewriteEnabled
  ? createRewriteService(createRewriteGenerator(process.env.OPENROUTER_API_KEY ?? ''))
  : undefined;
const server = createApp({
  rewrite,
  database,
  reviewerAuth,
  clerkFrontendApiOrigin,
  foundation,
}).listen(port, host, () => {
  foundation?.worker.start();
  console.info(
    `Basirah API listening on port ${port}; source review ${foundation ? 'enabled' : 'unavailable'}; provisional semantic pilot ${foundation?.semanticPilot ? 'enabled' : 'disabled'}.`,
  );
});
async function closeResources() {
  rewrite?.close();
  await Promise.allSettled([
    foundation?.worker.stop(),
    foundation?.reports.close(),
    foundation?.corpusPool?.end(),
    foundation?.webCachePool?.end(),
    database.close(),
  ]);
}
server.on('error', () => {
  console.error('API_LISTEN_FAILED');
  void closeResources().finally(() => process.exit(1));
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close(() => void closeResources().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
