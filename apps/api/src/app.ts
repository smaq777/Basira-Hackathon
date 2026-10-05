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
import { FoundationReportSchema } from '../../../packages/contracts/src/foundation.js';
import { isSafeDraftText, MAX_DRAFT_LENGTH } from '../../../packages/contracts/src/draft-text.js';
import type { ReviewStore } from './review-store.js';
import type { ReviewerDecision, TicketStore } from './ticket-store.js';
import {
  emailLookupHash,
  encryptTicketContact,
  normalizeEmail,
  ticketCode,
} from './ticket-crypto.js';

const TextInput = z
  .object({
    text: z
      .string()
      .min(1)
      .max(12_000)
      .refine((text) => text.trim().length > 0 && isSafeDraftText(text)),
  })
  .strict();
const DocumentParams = z.object({ documentId: z.uuid() }).strict();
const ReviewInput = z.object({ revisionId: z.uuid() }).strict();
const ReviewParams = z.object({ reviewId: z.uuid() }).strict();
const RevisionParams = z.object({ revisionId: z.uuid() }).strict();
const IdempotencyKey = z.uuid();
const TicketCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^BR-[A-Z0-9]{12}$/u);
const EmailAddress = z.email().max(254).transform(normalizeEmail);
const TicketContactInput = z
  .object({
    name: z.string().trim().max(120).optional(),
    email: EmailAddress.optional(),
    notify: z.boolean().default(false),
  })
  .strict()
  .refine((value) => !value.notify || Boolean(value.email), {
    message: 'EMAIL_REQUIRED_FOR_NOTIFY',
  });
const TicketLookupInput = z.object({ ticketCode: TicketCode, email: EmailAddress }).strict();
const ReviewerTicketParams = z.object({ ticketCode: TicketCode }).strict();
const ReviewerResponseInput = z
  .object({
    decision: z.enum(['needs_context', 'bounded_revision', 'returned']),
    text: z.string().trim().min(1).max(12_000),
    publish: z.boolean().default(false),
  })
  .strict();
const RetrievalApprovalInput = z
  .object({
    sourceReference: z.string().trim().min(1).max(500),
    provenance: z.record(z.string(), z.unknown()),
  })
  .strict()
  .refine((value) => Object.keys(value.provenance).length > 0, { message: 'PROVENANCE_REQUIRED' });
const guestCookie = 'basirah_guest';

function supportsExpiredGuestCleanup(migrationVersion?: string): boolean {
  const sequence = Number(migrationVersion?.match(/^(\d{4})_/u)?.[1] ?? 0);
  return sequence >= 5;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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
  foundation?: {
    worker: { notify(): void };
    reports: Pick<ReviewStore, 'ownedReport'>;
    researchPreview: boolean;
    liveTafsir?: boolean;
    semanticPilot?: boolean;
    webDiscovery?: boolean;
    webProvider?: 'firecrawl' | 'tinyfish_first';
  };
  database?: BackendDatabase;
  production?: boolean;
  reviewerAuth?: ReviewerAuthGateway;
  tickets?: {
    store: TicketStore;
    dataKey: string;
    lookupPepper: string;
    notifications?: { notify(): void };
  };
  clerkFrontendApiOrigin?: string;
  rateLimits?: {
    sessionLimit?: number;
    sessionWindowMs?: number;
    guestMutationLimit?: number;
    guestMutationWindowMs?: number;
    now?: () => number;
    ticketLookupLimit?: number;
    ticketLookupWindowMs?: number;
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
  const ticketLookupRateLimit = fixedWindowRateLimit({
    limit: options.rateLimits?.ticketLookupLimit ?? 8,
    windowMs: options.rateLimits?.ticketLookupWindowMs ?? 10 * 60_000,
    key: (request) => `ticket-lookup:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
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
      // Configured acquisition adapters, not a provider-health or semantic-verification claim.
      liveProviders: [
        ...(options.foundation?.liveTafsir ? ['tafsir_mcp'] : []),
        ...(options.foundation?.semanticPilot ? ['openrouter'] : []),
        ...(options.foundation?.webDiscovery ? ['firecrawl'] : []),
        ...(options.foundation?.webDiscovery && options.foundation.webProvider === 'tinyfish_first'
          ? ['tinyfish']
          : []),
      ],
      provisionalSemanticAssessment: options.foundation?.semanticPilot ?? false,
      accounts: reviewerAuth.configured,
      reviewerAuthentication: reviewerAuth.configured,
      reviewerAuthorization: reviewerAuth.authorizationConfigured,
      preflightDemo: true,
      foundationReview:
        Boolean(options.foundation) &&
        state.ready &&
        Number(state.migrationVersion?.slice(0, 4)) >= 7,
      researchPreview: options.foundation?.researchPreview ?? false,
      maximumTextLength: MAX_DRAFT_LENGTH,
      draftRewrite: false,
      reviewTickets:
        Boolean(options.tickets) &&
        state.ready &&
        Number(state.migrationVersion?.slice(0, 4)) >= 11,
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
  const requireReviewer = async (request: Request, response: Response) => {
    const access = await reviewerAuth.resolve(request);
    if (access.state === 'unavailable') {
      response.status(503).json({ code: 'REVIEWER_AUTH_UNAVAILABLE' });
      return null;
    }
    if (access.state === 'unauthenticated') {
      response.status(401).json({ code: 'REVIEWER_SIGN_IN_REQUIRED' });
      return null;
    }
    if (access.state === 'forbidden') {
      response.status(403).json({ code: 'REVIEWER_ACCESS_DENIED' });
      return null;
    }
    return access.userId;
  };
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
      if (text.length > MAX_DRAFT_LENGTH)
        return res.status(400).json({ code: 'TEXT_TOO_LONG', maximumTextLength: 3_000 });
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
        if (text.length > MAX_DRAFT_LENGTH)
          return res.status(400).json({ code: 'TEXT_TOO_LONG', maximumTextLength: 3_000 });
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
      if (options.foundation) {
        const revision = await database.getRevision(
          credentials.publicId,
          credentials.ownershipSecret,
          revisionId,
        );
        if (!revision) return res.status(404).json({ code: 'REVISION_NOT_FOUND' });
        if (revision.text.length > 3_000)
          return res.status(400).json({ code: 'TEXT_TOO_LONG', maximumTextLength: 3_000 });
      }
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
      options.foundation?.worker.notify();
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
  app.get('/api/v1/reviews/:reviewId/report', async (req, res, next) => {
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
      if (!options.foundation) return res.status(503).json({ code: 'EVIDENCE_REVIEW_UNAVAILABLE' });
      const stored = await options.foundation.reports.ownedReport(
        credentials.publicId,
        credentials.ownershipSecret,
        reviewId,
      );
      if (!stored)
        return res
          .status(202)
          .json({ report: null, reviewId, revisionId: run.revisionId, status: run.status });
      const parsed = FoundationReportSchema.safeParse(stored);
      if (
        !parsed.success ||
        parsed.data.reviewId !== reviewId ||
        parsed.data.revisionId !== run.revisionId
      )
        throw new Error('INVALID_STORED_REPORT');
      return res.json({ report: parsed.data });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/reviews/:reviewId/tickets', guestMutationRateLimit, async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      const credentials = guestCredentials(req);
      if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
      const { reviewId } = ReviewParams.parse(req.params);
      const contact = TicketContactInput.parse(req.body);
      const encrypted = contact.email
        ? encryptTicketContact(
            { email: contact.email, name: contact.name },
            options.tickets.dataKey,
          )
        : null;
      const receipt = await options.tickets.store.create(
        credentials.publicId,
        credentials.ownershipSecret,
        reviewId,
        ticketCode(),
        contact.email ? emailLookupHash(contact.email, options.tickets.lookupPepper) : null,
        encrypted,
        contact.notify,
      );
      if (!receipt) return res.status(404).json({ code: 'REVIEW_NOT_READY_FOR_TICKET' });
      return res.status(201).json(receipt);
    } catch (error) {
      return next(error);
    }
  });
  app.patch(
    '/api/v1/tickets/:ticketCode/contact',
    guestMutationRateLimit,
    async (req, res, next) => {
      try {
        if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
        const credentials = guestCredentials(req);
        if (!credentials) return res.status(401).json({ code: 'INVALID_OR_EXPIRED_SESSION' });
        const { ticketCode: code } = ReviewerTicketParams.parse(req.params);
        const contact = TicketContactInput.extend({ email: EmailAddress }).parse(req.body);
        const receipt = await options.tickets.store.updateContact(
          credentials.publicId,
          credentials.ownershipSecret,
          code,
          emailLookupHash(contact.email, options.tickets.lookupPepper),
          encryptTicketContact(
            { email: contact.email, name: contact.name },
            options.tickets.dataKey,
          ),
          contact.notify,
        );
        if (!receipt) return res.status(404).json({ code: 'TICKET_NOT_FOUND' });
        return res.json(receipt);
      } catch (error) {
        return next(error);
      }
    },
  );
  app.post('/api/v1/ticket-lookup', ticketLookupRateLimit, async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      const input = TicketLookupInput.parse(req.body);
      const result = await options.tickets.store.lookup(
        input.ticketCode,
        emailLookupHash(input.email, options.tickets.lookupPepper),
      );
      // Wrong ticket/email pairs intentionally use the same status and small response shape.
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/reviewer/tickets', async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      if (!(await requireReviewer(req, res))) return;
      return res.json({ tickets: await options.tickets.store.list() });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/reviewer/tickets/:ticketCode', async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      if (!(await requireReviewer(req, res))) return;
      const { ticketCode: code } = ReviewerTicketParams.parse(req.params);
      const ticket = await options.tickets.store.get(code);
      if (!ticket) return res.status(404).json({ code: 'TICKET_NOT_FOUND' });
      return res.json({ ticket });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/reviewer/tickets/:ticketCode/responses', async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      const reviewerUserId = await requireReviewer(req, res);
      if (!reviewerUserId) return;
      const { ticketCode: code } = ReviewerTicketParams.parse(req.params);
      const input = ReviewerResponseInput.parse(req.body);
      const saved = await options.tickets.store.saveResponse(
        code,
        reviewerUserId,
        input.decision as ReviewerDecision,
        input.text,
        input.publish,
      );
      if (!saved) return res.status(404).json({ code: 'TICKET_NOT_FOUND' });
      if (input.publish) options.tickets.notifications?.notify();
      return res.status(input.publish ? 201 : 200).json({ response: saved });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/reviewer/tickets/:ticketCode/retrieval-approval', async (req, res, next) => {
    try {
      if (!options.tickets) return res.status(503).json({ code: 'TICKETS_UNAVAILABLE' });
      const reviewerUserId = await requireReviewer(req, res);
      if (!reviewerUserId) return;
      const { ticketCode: code } = ReviewerTicketParams.parse(req.params);
      const input = RetrievalApprovalInput.parse(req.body);
      const approved = await options.tickets.store.approveForRetrieval(
        code,
        reviewerUserId,
        input.sourceReference,
        input.provenance,
      );
      if (!approved) return res.status(409).json({ code: 'PUBLISHED_RESPONSE_REQUIRED' });
      return res.status(201).json({ approved: true });
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
    if (isUniqueConstraintError(error))
      return res.status(409).json({ code: 'TICKET_ALREADY_PUBLISHED' });
    if (error instanceof SyntaxError) return res.status(400).json({ code: 'INVALID_JSON' });
    console.error('Request failed', error instanceof Error ? error.message : 'unknown error');
    return res.status(503).json({ code: 'SERVICE_UNAVAILABLE' });
  });
  return app;
}
