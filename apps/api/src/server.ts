import { createApp } from './app.js';
import { createDatabase, DatabaseUnavailable } from './database.js';
import { createClerkReviewerAuth } from './reviewer-auth.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
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
const server = createApp({
  database,
  reviewerAuth,
  clerkFrontendApiOrigin,
}).listen(port, '0.0.0.0', () =>
  console.info(`Basirah API listening on port ${port}; evidence review remains unavailable.`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close(() => void database.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
