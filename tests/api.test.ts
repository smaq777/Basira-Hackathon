import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/api/src/app.js';
import type { BackendDatabase } from '../apps/api/src/database.js';
import {
  createClerkReviewerAuth,
  parseReviewerAccessMode,
  type ReviewerAuthGateway,
} from '../apps/api/src/reviewer-auth.js';

let server: Server;
let base: string;
const reviewKeys = new Set<string>();
const reviewId = '55555555-5555-4555-8555-555555555555';
const revisionId = '33333333-3333-4333-8333-333333333333';
const ownedCookie = `basirah_guest=11111111-1111-4111-8111-111111111111.${'a'.repeat(64)}`;
let purgeCalls = 0;
const database: BackendDatabase = {
  async readiness() {
    return {
      ready: true,
      migrationVersion: '0005_expired_guest_cleanup',
      databaseName: 'basirah',
      serverVersion: '18',
    };
  },
  async createGuestSession() {
    return {
      publicId: '11111111-1111-4111-8111-111111111111',
      ownershipSecret: 'a'.repeat(64),
      expiresAt: '2026-10-02T12:00:00.000Z',
    };
  },
  async purgeExpiredGuestSessions() {
    purgeCalls += 1;
    return 0;
  },
  async deleteGuestSession() {
    return true;
  },
  async createDocument() {
    return {
      documentId: '22222222-2222-4222-8222-222222222222',
      revisionId: '33333333-3333-4333-8333-333333333333',
      version: 1,
    };
  },
  async createRevision() {
    return {
      documentId: '22222222-2222-4222-8222-222222222222',
      revisionId: '44444444-4444-4444-8444-444444444444',
      version: 2,
    };
  },
  async getRevision() {
    return {
      documentId: '22222222-2222-4222-8222-222222222222',
      revisionId,
      version: 1,
      text: 'قال تعالى: «نص اصطناعي» [مرجع اصطناعي]. وهذا ادعاء آخر.',
    };
  },
  async createReviewRun(_publicId, _secret, requestedRevisionId, idempotencyKey) {
    const replayed = reviewKeys.has(idempotencyKey);
    reviewKeys.add(idempotencyKey);
    return {
      reviewId,
      revisionId: requestedRevisionId,
      status: 'queued',
      attempt: 1,
      corpusVersion: 'unconfigured',
      createdAt: '2026-10-03T00:00:00.000Z',
      deadlineAt: '2026-10-03T00:01:00.000Z',
      completedAt: null,
      replayed,
    };
  },
  async getReviewRun() {
    return {
      reviewId,
      revisionId,
      status: 'queued',
      attempt: 1,
      corpusVersion: 'unconfigured',
      createdAt: '2026-10-03T00:00:00.000Z',
      deadlineAt: '2026-10-03T00:01:00.000Z',
      completedAt: null,
    };
  },
  async cancelReviewRun() {
    return {
      reviewId,
      revisionId,
      status: 'cancelled',
      attempt: 1,
      corpusVersion: 'unconfigured',
      createdAt: '2026-10-03T00:00:00.000Z',
      deadlineAt: '2026-10-03T00:01:00.000Z',
      completedAt: '2026-10-03T00:00:10.000Z',
    };
  },
  async close() {},
};

beforeAll(async () => {
  server = createApp({ database, production: true }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

it('liveness is not product readiness', async () => {
  const response = await fetch(base + '/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', stage: 'mvp_backend' });
});

it('reports infrastructure readiness without claiming verification', async () => {
  const response = await fetch(base + '/ready');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    database: 'ready',
    migrationVersion: '0005_expired_guest_cleanup',
    verification: false,
  });
});

it('reports honest capabilities', async () => {
  const response = await fetch(base + '/api/v1/capabilities');
  expect(await response.json()).toMatchObject({
    database: true,
    guestDocuments: true,
    verification: false,
    liveProviders: [],
    preflightDemo: true,
    reviewerAuthentication: false,
    reviewerAuthorization: false,
  });
});

it('returns bounded provisional preflight findings without persisting a document', async () => {
  const response = await fetch(base + '/api/v1/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات والأهداف» [صحيح البخاري: 1].',
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    mode: 'local_demo',
    verification: false,
    corpusVersion: 'software-fixture-v1',
    offsetUnit: 'utf16_code_unit',
    annotations: [
      { contentType: 'isnad' },
      { contentType: 'hadith_matn' },
      { contentType: 'claimed_source' },
    ],
    findings: [
      {
        contentType: 'hadith_matn',
        issueCode: 'quotation_mismatch',
        severity: 'warning',
      },
    ],
  });
});

it('rejects short or oversized preflight input', async () => {
  const short = await fetch(base + '/api/v1/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'قصير' }),
  });
  expect(short.status).toBe(400);

  const oversized = await fetch(base + '/api/v1/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'ن'.repeat(3001) }),
  });
  expect(oversized.status).toBe(400);
});

it('fails closed when reviewer authentication is not configured', async () => {
  const response = await fetch(base + '/api/v1/reviewer/session');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: 'REVIEWER_AUTH_UNAVAILABLE' });
});

it('rejects partial or unsafe Clerk origin configuration before serving requests', () => {
  expect(() =>
    createClerkReviewerAuth({
      CLERK_PUBLISHABLE_KEY: 'public',
      CLERK_SECRET_KEY: 'secret',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv),
  ).toThrow(/CLERK_AUTHORIZED_PARTIES/u);
  expect(() =>
    createClerkReviewerAuth({
      CLERK_PUBLISHABLE_KEY: 'public',
      CLERK_SECRET_KEY: 'secret',
      CLERK_AUTHORIZED_PARTIES: 'http://example.com',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv),
  ).toThrow(/exact HTTPS origin/u);
  expect(() =>
    createApp({ clerkFrontendApiOrigin: 'https://clerk.example; script-src *', production: true }),
  ).toThrow(/origin/u);
});

it('keeps allowlist authorization as the default and requires an explicit hackathon mode', () => {
  expect(parseReviewerAccessMode()).toBe('allowlist');
  expect(parseReviewerAccessMode('authenticated')).toBe('authenticated');
  expect(() => parseReviewerAccessMode('open')).toThrow(/allowlist or authenticated/u);

  const reviewerAuth = createClerkReviewerAuth({
    CLERK_PUBLISHABLE_KEY: 'public',
    CLERK_SECRET_KEY: 'secret',
    CLERK_AUTHORIZED_PARTIES: 'https://staging.example.com',
    CLERK_REVIEWER_ACCESS_MODE: 'authenticated',
    NODE_ENV: 'production',
  } as NodeJS.ProcessEnv);
  expect(reviewerAuth.accessMode).toBe('authenticated');
  expect(reviewerAuth.authorizationConfigured).toBe(true);
});

it('rejects the staging-wide reviewer mode in an explicit production deployment', () => {
  expect(() =>
    createClerkReviewerAuth({
      CLERK_PUBLISHABLE_KEY: 'public',
      CLERK_SECRET_KEY: 'secret',
      CLERK_AUTHORIZED_PARTIES: 'https://production.example.com',
      CLERK_REVIEWER_ACCESS_MODE: 'authenticated',
      NODE_ENV: 'production',
      BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production',
    } as NodeJS.ProcessEnv),
  ).toThrow(/Production reviewer access requires/u);
});

it('separates reviewer authentication from authorization', async () => {
  const reviewerAuth: ReviewerAuthGateway = {
    configured: true,
    authorizationConfigured: true,
    accessMode: 'allowlist',
    middleware: (_request, _response, next) => next(),
    async resolve(request) {
      const token = request.header('authorization');
      if (!token) return { state: 'unauthenticated' };
      if (token !== 'Bearer reviewer-token') return { state: 'forbidden' };
      return { state: 'allowed', userId: 'user_reviewer' };
    },
  };
  const protectedServer = createApp({ database, production: false, reviewerAuth }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((resolve) => protectedServer.once('listening', resolve));
  const protectedBase = `http://127.0.0.1:${(protectedServer.address() as AddressInfo).port}`;
  try {
    expect((await fetch(protectedBase + '/api/v1/reviewer/session')).status).toBe(401);
    expect(
      (
        await fetch(protectedBase + '/api/v1/reviewer/session', {
          headers: { authorization: 'Bearer other-user' },
        })
      ).status,
    ).toBe(403);
    const allowed = await fetch(protectedBase + '/api/v1/reviewer/session', {
      headers: { authorization: 'Bearer reviewer-token' },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ authenticated: true, reviewer: true });
  } finally {
    await new Promise<void>((resolve, reject) =>
      protectedServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('creates a secure guest session without returning the ownership secret', async () => {
  const before = purgeCalls;
  const response = await fetch(base + '/api/v1/sessions', { method: 'POST' });
  expect(response.status).toBe(201);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
  expect(response.headers.get('set-cookie')).toContain('Secure');
  expect(await response.json()).toEqual({
    sessionId: '11111111-1111-4111-8111-111111111111',
    expiresAt: '2026-10-02T12:00:00.000Z',
  });
  expect(purgeCalls).toBe(before + 1);
});

it('requires guest ownership for document creation', async () => {
  const response = await fetch(base + '/api/v1/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'نص اصطناعي' }),
  });
  expect(response.status).toBe(401);
});

it('creates an immutable first revision for the owned guest', async () => {
  const response = await fetch(base + '/api/v1/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownedCookie,
    },
    body: JSON.stringify({ text: 'نص اصطناعي' }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ version: 1 });
  const cookie = response.headers.get('set-cookie') ?? '';
  expect(cookie).toContain(ownedCookie);
  expect(cookie).toContain('Max-Age=86400');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Strict');
});

it('creates an owned review run without claiming verification', async () => {
  const idempotencyKey = '66666666-6666-4666-8666-666666666666';
  const response = await fetch(base + '/api/v1/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownedCookie,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ revisionId }),
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    reviewId,
    revisionId,
    status: 'queued',
    corpusVersion: 'unconfigured',
  });

  const replay = await fetch(base + '/api/v1/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownedCookie,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ revisionId }),
  });
  expect(replay.status).toBe(200);
  expect(replay.headers.get('idempotent-replayed')).toBe('true');
  expect(await replay.json()).toMatchObject({ reviewId, status: 'queued' });
});

it('extracts bounded claim candidates automatically for an owned revision', async () => {
  const response = await fetch(`${base}/api/v1/revisions/${revisionId}/extractions`, {
    method: 'POST',
    headers: { cookie: ownedCookie },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    revisionId,
    automatic: true,
    verification: false,
    extraction: {
      offsetUnit: 'utf16_code_unit',
    },
  });
  expect(body.extraction.candidates[0]).toMatchObject({
    claimType: 'quotation',
    quotation: 'نص اصطناعي',
    reference: 'مرجع اصطناعي',
  });
});

it('requires ownership and a valid idempotency key for review creation', async () => {
  const noSession = await fetch(base + '/api/v1/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revisionId }),
  });
  expect(noSession.status).toBe(401);

  const noKey = await fetch(base + '/api/v1/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: ownedCookie },
    body: JSON.stringify({ revisionId }),
  });
  expect(noKey.status).toBe(400);
  expect(await noKey.json()).toMatchObject({ code: 'INVALID_REQUEST' });
});

it('reads and cancels an owned review run explicitly', async () => {
  const current = await fetch(`${base}/api/v1/reviews/${reviewId}`, {
    headers: { cookie: ownedCookie },
  });
  expect(current.status).toBe(200);
  expect(await current.json()).toMatchObject({ reviewId, status: 'queued' });

  const cancelled = await fetch(`${base}/api/v1/reviews/${reviewId}`, {
    method: 'DELETE',
    headers: { cookie: ownedCookie },
  });
  expect(cancelled.status).toBe(200);
  expect(await cancelled.json()).toMatchObject({ reviewId, status: 'cancelled' });
});

it('API 404 is JSON', async () => {
  const response = await fetch(base + '/api/unknown');
  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toContain('application/json');
});

it('applies security and cache headers', async () => {
  const response = await fetch(base + '/health');
  expect(response.headers.get('x-powered-by')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('permissions-policy')).toContain('camera=()');
});

it('rate-limits public session creation before repeated database writes', async () => {
  const limited = createApp({
    database,
    production: false,
    rateLimits: { sessionLimit: 1, sessionWindowMs: 60_000 },
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => limited.once('listening', resolve));
  const limitedBase = `http://127.0.0.1:${(limited.address() as AddressInfo).port}`;
  try {
    expect((await fetch(limitedBase + '/api/v1/sessions', { method: 'POST' })).status).toBe(201);
    const rejected = await fetch(limitedBase + '/api/v1/sessions', { method: 'POST' });
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('retry-after')).not.toBeNull();
    expect(await rejected.json()).toEqual({ code: 'RATE_LIMITED' });
  } finally {
    await new Promise<void>((resolve, reject) =>
      limited.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('keeps explicit guest deletion available after the mutation budget is exhausted', async () => {
  const limited = createApp({
    database,
    production: false,
    rateLimits: { guestMutationLimit: 1, guestMutationWindowMs: 60_000 },
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => limited.once('listening', resolve));
  const limitedBase = `http://127.0.0.1:${(limited.address() as AddressInfo).port}`;
  try {
    const mutation = () =>
      fetch(limitedBase + '/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ownedCookie },
        body: JSON.stringify({ text: 'نص اصطناعي' }),
      });
    expect((await mutation()).status).toBe(201);
    expect((await mutation()).status).toBe(429);
    expect(
      (
        await fetch(limitedBase + '/api/v1/session', {
          method: 'DELETE',
          headers: { cookie: ownedCookie },
        })
      ).status,
    ).toBe(204);
  } finally {
    await new Promise<void>((resolve, reject) =>
      limited.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
