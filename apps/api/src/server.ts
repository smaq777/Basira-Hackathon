import { createApp } from './app.js';
import { createDatabase, DatabaseUnavailable } from './database.js';
import { createClerkReviewerAuth } from './reviewer-auth.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createPythonAdapter } from './foundation.js';
import { createReviewStore } from './review-store.js';
import { createFoundationWorker } from './review-worker.js';

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
  const python = process.env.FOUNDATION_PYTHON;
  const sourceDatabase = process.env.FOUNDATION_DATABASE;
  const workerUrl = process.env.REVIEW_WORKER_DATABASE_URL;
  if (!connectionString || !python || !sourceDatabase || !workerUrl)
    throw new Error('FOUNDATION_CONFIGURATION_INCOMPLETE');
  const readiness = await database.readiness();
  if (!readiness.ready || !(Number(readiness.migrationVersion?.slice(0, 4)) >= 6))
    throw new Error('FOUNDATION_MIGRATION_REQUIRED');
  const adapter = createPythonAdapter({
    python,
    script: resolve('apps/foundation_worker/intake_bridge.py'),
    cwd: resolve('apps/foundation_worker'),
    database: sourceDatabase,
    snapshotDirectory: process.env.FOUNDATION_SNAPSHOTS || undefined,
    researchPreview,
  });
  try {
    const intake = await adapter.analyze('تهيئة محرك المصادر المحلي.', randomUUID());
    const configured = process.env.CORPUS_VERSION?.trim();
    if (configured && configured !== 'unconfigured' && configured !== intake.corpusVersion)
      throw new Error('FOUNDATION_CORPUS_VERSION_MISMATCH');
    process.env.CORPUS_VERSION = intake.corpusVersion;
    const store = createReviewStore(workerUrl);
    const reports = createReviewStore(connectionString);
    const worker = createFoundationWorker(adapter, store);
    return {
      worker,
      reports,
      researchPreview,
      liveTafsir: process.env.FOUNDATION_TAFSIR_LIVE === 'true',
    };
  } catch (error) {
    await adapter.close();
    throw error;
  }
}
const foundation = await initializeFoundation().catch(async (error: unknown) => {
  await database.close();
  throw error;
});
const server = createApp({
  database,
  reviewerAuth,
  clerkFrontendApiOrigin,
  foundation,
}).listen(port, host, () => {
  foundation?.worker.start();
  console.info(
    `Basirah API listening on port ${port}; source review ${foundation ? 'enabled' : 'unavailable'}; semantic verification unavailable.`,
  );
});
async function closeResources() {
  await Promise.allSettled([
    foundation?.worker.stop(),
    foundation?.reports.close(),
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
