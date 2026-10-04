import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { extractClaimCandidates } from '../../../packages/contracts/src/index.js';
import {
  DatabaseUnavailable,
  OwnershipError,
  ResourceLimitError,
  type BackendDatabase,
} from './database.js';
import { fixedWindowRateLimit } from './rate-limit.js';
import {
  normalizeTrustedOrigin,
  unavailableReviewerAuth,
  type ReviewerAuthGateway,
} from './reviewer-auth.js';
import { buildDemoPreflight, PreflightInputSchema } from './preflight.js';

const TextInput = z.object({ text: z.string().trim().min(1).max(12_000) }).strict();
const DocumentParams = z.object({ documentId: z.uuid() }).strict();
const ReviewInput = z.object({ revisionId: z.uuid() }).strict();
const ReviewParams = z.object({ reviewId: z.uuid() }).strict();
const RevisionParams = z.object({ revisionId: z.uuid() }).strict();
const IdempotencyKey = z.uuid();
const guestCookie = 'basirah_guest';

function supportsExpiredGuestCleanup(migrationVersion?: string): boolean {
  const sequence = Number(migrationVersion?.match(/^(\d{4})_/u)?.[1] ?? 0);
  return sequence >= 5;
}

function parseCookies(request: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      continue;
    }
  }
  return cookies;
}

function guestCredentials(request: Request): { publicId: string; ownershipSecret: string } | null {
  const token = parseCookies(request)[guestCookie];
  const match = token?.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-9a-f]{64})$/iu,
  );
  return match?.[1] && match[2] ? { publicId: match[1], ownershipSecret: match[2] } : null;
}

function setGuestCookie(
  response: Response,
  value: string,
  maxAgeSeconds: number,
  production: boolean,
) {
  const attributes = [
    `${guestCookie}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (production) attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

type AppOptions = {
  database?: BackendDatabase;
  production?: boolean;
  reviewerAuth?: ReviewerAuthGateway;
  clerkFrontendApiOrigin?: string;
  rateLimits?: {
    sessionLimit?: number;
    sessionWindowMs?: number;
    guestMutationLimit?: number;
    guestMutationWindowMs?: number;
    now?: () => number;
  };
};

export function createApp(options: AppOptions = {}) {
  const database = options.database ?? new DatabaseUnavailable();
  const reviewerAuth = options.reviewerAuth ?? unavailableReviewerAuth;
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const clerkOrigin = options.clerkFrontendApiOrigin?.trim()
    ? normalizeTrustedOrigin(
        options.clerkFrontendApiOrigin.trim(),
        production,
        'CLERK_FRONTEND_API_ORIGIN',
      )
    : undefined;
  const retentionHours = Number(process.env.GUEST_RETENTION_HOURS ?? 24);
  const reviewDeadlineSeconds = Number(process.env.REVIEW_DEADLINE_SECONDS ?? 60);
  const corpusVersion = process.env.CORPUS_VERSION?.trim() || 'unconfigured';
  const app = express();
  app.set('trust proxy', production ? 1 : false);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      clerkOrigin
        ? [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline' ${clerkOrigin} https://challenges.cloudflare.com https://*.protect.clerk.com`,
            `connect-src 'self' ${clerkOrigin} https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com`,
            "img-src 'self' data: https://img.clerk.com",
            "worker-src 'self' blob:",
            "style-src 'self' 'unsafe-inline'",
            "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com",
            "form-action 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
          ].join('; ')
        : "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use('/api/v1/reviewer', reviewerAuth.middleware);
  app.use(express.json({ limit: '32kb', type: 'application/json' }));
  const sessionRateLimit = fixedWindowRateLimit({
    limit: options.rateLimits?.sessionLimit ?? 12,
    windowMs: options.rateLimits?.sessionWindowMs ?? 10 * 60_000,
    key: (request) => `session:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
    now: options.rateLimits?.now,
  });
  const guestMutationRateLimit = fixedWindowRateLimit({
    limit: options.rateLimits?.guestMutationLimit ?? 60,
    windowMs: options.rateLimits?.guestMutationWindowMs ?? 60_000,
    key: (request) => {
      const credentials = guestCredentials(request);
      return credentials
        ? `guest:${credentials.publicId}`
        : `anonymous:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
    },
    now: options.rateLimits?.now,
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', stage: 'mvp_backend' }));
  app.get('/ready', async (_req, res) => {
    const state = await database.readiness();
    if (!state.ready) return res.status(503).json({ status: 'not_ready', reason: state.reason });
    return res.json({
      status: 'ready',
      database: 'ready',
      migrationVersion: state.migrationVersion,
      verification: false,
    });
  });
  app.get('/api/v1/capabilities', async (_req, res) => {
    const state = await database.readiness();
    res.json({
      stage: 'mvp_backend',
      database: state.ready,
      guestDocuments: state.ready,
      reviewOrchestration: state.ready,
      verification: false,
      liveProviders: [],
      accounts: reviewerAuth.configured,
      reviewerAuthentication: reviewerAuth.configured,
      reviewerAuthorization: reviewerAuth.authorizationConfigured,
      preflightDemo: true,
    });
  });
  app.post('/api/v1/preflight', guestMutationRateLimit, (req, res, next) => {
    try {
      const input = PreflightInputSchema.parse(req.body);
      return res.json(buildDemoPreflight(input));
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/reviewer/session', async (req, res, next) => {
    try {
      const access = await reviewerAuth.resolve(req);
      if (access.state === 'unavailable')
        return res.status(503).json({ code: 'REVIEWER_AUTH_UNAVAILABLE' });
      if (access.state === 'unauthenticated')
        return res.status(401).json({ code: 'REVIEWER_SIGN_IN_REQUIRED' });
      if (access.state === 'forbidden')
        return res.status(403).json({ code: 'REVIEWER_ACCESS_DENIED' });
      return res.json({ authenticated: true, reviewer: true });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/sessions', sessionRateLimit, async (_req, res, next) => {
    try {
      if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 24)
        throw new Error('INVALID_RETENTION_CONFIGURATION');
      const readiness = await database.readiness();
      if (supportsExpiredGuestCleanup(readiness.migrationVersion))
        await database.purgeExpiredGuestSessions(100);
      const session = await database.createGuestSession(retentionHours);
      setGuestCookie(
        res,
        `${session.publicId}.${session.ownershipSecret}`,
        retentionHours * 60 * 60,
        production,
      );
      res.status(201).json({ sessionId: session.publicId, expiresAt: session.expiresAt });
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/session', async (req, res, next) => {
    try {
      const credentials = guestCredentials(req);
      if (credentials)
        await database.deleteGuestSession(credentials.publicId, credentials.ownershipSecret);
      setGuestCookie(res, '', 0, production);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/documents', guestMutationRateLimit, async (req, res, next) => {
    try {
      const credentials = guestCredentials(req);
      if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
      const { text } = TextInput.parse(req.body);
      const created = await database.createDocument(
        credentials.publicId,
        credentials.ownershipSecret,
        text,
      );
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  });
  app.post(
    '/api/v1/documents/:documentId/revisions',
    guestMutationRateLimit,
    async (req, res, next) => {
      try {
        const credentials = guestCredentials(req);
        if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
        const { documentId } = DocumentParams.parse(req.params);
        const { text } = TextInput.parse(req.body);
        const created = await database.createRevision(
          credentials.publicId,
          credentials.ownershipSecret,
          documentId,
          text,
        );
        if (!created) return res.status(404).json({ code: 'DOCUMENT_NOT_FOUND' });
        return res.status(201).json(created);
      } catch (error) {
        return next(error);
      }
    },
  );
  app.post(
    '/api/v1/revisions/:revisionId/extractions',
    guestMutationRateLimit,
    async (req, res, next) => {
      try {
        const credentials = guestCredentials(req);
        if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
        const { revisionId } = RevisionParams.parse(req.params);
        const revision = await database.getRevision(
          credentials.publicId,
          credentials.ownershipSecret,
          revisionId,
        );
        if (!revision) return res.status(404).json({ code: 'REVISION_NOT_FOUND' });
        return res.json({
          revisionId: revision.revisionId,
          version: revision.version,
          extraction: extractClaimCandidates(revision.text),
          automatic: true,
          verification: false,
        });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.post('/api/v1/reviews', guestMutationRateLimit, async (req, res, next) => {
    try {
      const credentials = guestCredentials(req);
      if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
      if (
        !Number.isInteger(reviewDeadlineSeconds) ||
        reviewDeadlineSeconds < 5 ||
        reviewDeadlineSeconds > 300
      )
        throw new Error('INVALID_REVIEW_DEADLINE_CONFIGURATION');
      if (corpusVersion.length > 120) throw new Error('INVALID_CORPUS_VERSION_CONFIGURATION');
      const idempotencyKey = IdempotencyKey.parse(req.header('Idempotency-Key'));
      const { revisionId } = ReviewInput.parse(req.body);
      const created = await database.createReviewRun(
        credentials.publicId,
        credentials.ownershipSecret,
        revisionId,
        idempotencyKey,
        reviewDeadlineSeconds,
        corpusVersion,
      );
      if (!created) return res.status(404).json({ code: 'REVISION_NOT_FOUND' });
      if (created.replayed) res.setHeader('Idempotent-Replayed', 'true');
      return res.status(created.replayed ? 200 : 202).json({
        reviewId: created.reviewId,
        revisionId: created.revisionId,
        status: created.status,
        attempt: created.attempt,
        corpusVersion: created.corpusVersion,
        createdAt: created.createdAt,
        deadlineAt: created.deadlineAt,
        completedAt: created.completedAt,
      });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/reviews/:reviewId', async (req, res, next) => {
    try {
      const credentials = guestCredentials(req);
      if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
      const { reviewId } = ReviewParams.parse(req.params);
      const run = await database.getReviewRun(
        credentials.publicId,
        credentials.ownershipSecret,
        reviewId,
      );
      if (!run) return res.status(404).json({ code: 'REVIEW_NOT_FOUND' });
      return res.json(run);
    } catch (error) {
      return next(error);
    }
  });
  app.delete('/api/v1/reviews/:reviewId', async (req, res, next) => {
    try {
      const credentials = guestCredentials(req);
      if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
      const { reviewId } = ReviewParams.parse(req.params);
      const run = await database.cancelReviewRun(
        credentials.publicId,
        credentials.ownershipSecret,
        reviewId,
      );
      if (!run) return res.status(404).json({ code: 'REVIEW_NOT_FOUND' });
      return res.json(run);
    } catch (error) {
      return next(error);
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  const web = resolve('apps/web/dist');
  if (existsSync(web)) app.use(express.static(web));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({ code: 'INVALID_REQUEST', issues: error.issues });
    if (error instanceof OwnershipError)
      return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
    if (error instanceof ResourceLimitError)
      return res.status(429).json({ code: 'RESOURCE_LIMIT_REACHED', resource: error.resource });
    if (error instanceof SyntaxError) return res.status(400).json({ code: 'INVALID_JSON' });
    console.error('Request failed', error instanceof Error ? error.message : 'unknown error');
    return res.status(503).json({ code: 'SERVICE_UNAVAILABLE' });
  });
  return app;
}
