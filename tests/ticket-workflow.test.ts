import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/api/src/app.js';
import type { BackendDatabase } from '../apps/api/src/database.js';
import type { ReviewerAuthGateway } from '../apps/api/src/reviewer-auth.js';
import {
  decryptTicketContact,
  emailLookupHash,
  encryptTicketContact,
  normalizeEmail,
  ticketCode,
} from '../apps/api/src/ticket-crypto.js';
import { createBrevoMailer } from '../apps/api/src/ticket-notifications.js';
import type { TicketStore } from '../apps/api/src/ticket-store.js';

const sessionId = '11111111-1111-4111-8111-111111111111';
const reviewId = '55555555-5555-4555-8555-555555555555';
const secret = 'a'.repeat(64);
const cookie = `basirah_guest=${sessionId}.${secret}`;
const code = 'BR-A1B2C3D4E5F6';
const dataKey = Buffer.alloc(32, 7).toString('base64');
const lookupPepper = 'lookup-pepper-with-at-least-32-characters';
const servers: Server[] = [];

const database = {
  readiness: vi
    .fn()
    .mockResolvedValue({ ready: true, migrationVersion: '0013_secure_review_tickets' }),
  purgeExpiredGuestSessions: vi.fn(),
  createGuestSession: vi.fn(),
  deleteGuestSession: vi.fn(),
  createDocument: vi.fn(),
  createRevision: vi.fn(),
  getRevision: vi.fn(),
  createReviewRun: vi.fn(),
  getReviewRun: vi.fn(),
  cancelReviewRun: vi.fn(),
  close: vi.fn(),
} satisfies BackendDatabase;

function storeFixture() {
  return {
    create: vi.fn<TicketStore['create']>().mockResolvedValue({
      ticketCode: code,
      status: 'pending',
      hasEmail: false,
      notifyOptIn: false,
      createdAt: '2026-10-05T12:00:00.000Z',
    }),
    updateContact: vi.fn<TicketStore['updateContact']>().mockResolvedValue({
      ticketCode: code,
      status: 'pending',
      hasEmail: true,
      notifyOptIn: true,
      createdAt: '2026-10-05T12:00:00.000Z',
    }),
    lookup: vi.fn<TicketStore['lookup']>().mockResolvedValue({ found: false }),
    list: vi.fn<TicketStore['list']>().mockResolvedValue([]),
    get: vi.fn<TicketStore['get']>().mockResolvedValue(null),
    saveResponse: vi.fn<TicketStore['saveResponse']>().mockResolvedValue({
      ticketCode: code,
      version: 1,
      decision: 'needs_context',
      text: 'يلزم الرجوع إلى مصدر معتمد.',
      published: true,
      createdAt: '2026-10-05T12:05:00.000Z',
    }),
    approveForRetrieval: vi.fn<TicketStore['approveForRetrieval']>().mockResolvedValue(true),
    claimNotifications: vi.fn<TicketStore['claimNotifications']>().mockResolvedValue([]),
    completeNotification: vi.fn<TicketStore['completeNotification']>().mockResolvedValue(true),
    close: vi.fn<TicketStore['close']>(),
  } satisfies TicketStore;
}

async function serve(store: TicketStore, reviewerAuth?: ReviewerAuthGateway) {
  const notification = { notify: vi.fn() };
  const server = createApp({
    database,
    reviewerAuth,
    tickets: { store, dataKey, lookupPepper, notifications: notification },
    production: false,
    rateLimits: { ticketLookupLimit: 2, ticketLookupWindowMs: 60_000 },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    notification,
  };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  vi.restoreAllMocks();
});

describe('ticket contact protection', () => {
  it('normalizes lookup identity while encrypting recoverable contact data', () => {
    expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
    expect(emailLookupHash('USER@example.com', lookupPepper)).toEqual(
      emailLookupHash('user@EXAMPLE.com', lookupPepper),
    );
    const encrypted = encryptTicketContact(
      { email: 'USER@example.com', name: 'أحمد <script>' },
      dataKey,
    );
    expect(encrypted.toString('utf8')).not.toContain('example.com');
    expect(decryptTicketContact(encrypted, dataKey)).toEqual({
      email: 'user@example.com',
      name: 'أحمد <script>',
    });
    expect(ticketCode()).toMatch(/^BR-[A-Z0-9]{12}$/u);
  });
});

it('creates a ticket only for the owned guest session and stores encrypted contact separately', async () => {
  const store = storeFixture();
  const { base } = await serve(store);
  expect(
    (
      await fetch(`${base}/api/v1/reviews/${reviewId}/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(401);
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ email: 'owner@example.com', name: 'صالح', notify: true }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ ticketCode: code, status: 'pending' });
  const call = store.create.mock.calls[0];
  expect(call?.[0]).toBe(sessionId);
  expect(call?.[1]).toBe(secret);
  expect(call?.[2]).toBe(reviewId);
  expect(call?.[4]).toBeInstanceOf(Buffer);
  expect(call?.[5]).toBeInstanceOf(Buffer);
  expect(call?.[6]).toBe(true);
});

it('keeps wrong ticket-email pairs indistinguishable and rate-limits enumeration', async () => {
  const store = storeFixture();
  const { base } = await serve(store);
  const request = () =>
    fetch(`${base}/api/v1/ticket-lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticketCode: code, email: 'wrong@example.com' }),
    });
  for (let index = 0; index < 2; index += 1) {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ found: false });
  }
  expect((await request()).status).toBe(429);
});

it('requires reviewer authorization and only notifies after publishing', async () => {
  const store = storeFixture();
  const reviewerAuth: ReviewerAuthGateway = {
    configured: true,
    authorizationConfigured: true,
    accessMode: 'allowlist',
    middleware: (_request, _response, next) => next(),
    async resolve(request) {
      return request.header('authorization') === 'Bearer reviewer'
        ? { state: 'allowed', userId: 'user_reviewer' }
        : { state: 'unauthenticated' };
    },
  };
  const { base, notification } = await serve(store, reviewerAuth);
  const path = `${base}/api/v1/reviewer/tickets/${code}/responses`;
  expect(
    (
      await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'needs_context', text: 'رد محفوظ', publish: true }),
      })
    ).status,
  ).toBe(401);
  const draft = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer reviewer' },
    body: JSON.stringify({ decision: 'needs_context', text: 'مسودة', publish: false }),
  });
  expect(draft.status).toBe(200);
  expect(notification.notify).not.toHaveBeenCalled();
  const published = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer reviewer' },
    body: JSON.stringify({
      decision: 'needs_context',
      text: 'يلزم الرجوع إلى مصدر معتمد.',
      publish: true,
    }),
  });
  expect(published.status).toBe(201);
  expect(notification.notify).toHaveBeenCalledTimes(1);
});

it('returns a conflict instead of a service error when a response is already published', async () => {
  const store = storeFixture();
  store.saveResponse.mockRejectedValueOnce(
    Object.assign(new Error('duplicate'), { code: '23505' }),
  );
  const reviewerAuth: ReviewerAuthGateway = {
    configured: true,
    authorizationConfigured: true,
    accessMode: 'allowlist',
    middleware: (_request, _response, next) => next(),
    async resolve() {
      return { state: 'allowed', userId: 'user_reviewer' };
    },
  };
  const { base } = await serve(store, reviewerAuth);
  const response = await fetch(`${base}/api/v1/reviewer/tickets/${code}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'returned', text: 'رد منشور', publish: true }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: 'TICKET_ALREADY_PUBLISHED' });
});

it('sends Brevo mail without reflecting unescaped contact HTML', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
  const mailer = createBrevoMailer({
    apiKey: 'secret-key',
    senderEmail: 'review@example.com',
    senderName: 'بصيرة',
    publicAppUrl: 'https://basirah.example',
    fetch: request,
  });
  await mailer.send({
    email: 'user@example.com',
    name: '<img src=x>',
    ticketCode: code,
    responseText: 'محفوظ في الموقع',
  });
  const init = request.mock.calls[0]?.[1];
  const body = JSON.parse(String(init?.body)) as { htmlContent: string; textContent: string };
  expect(init?.headers).toMatchObject({ 'api-key': 'secret-key' });
  expect(body.htmlContent).toContain('&lt;img src=x&gt;');
  expect(body.htmlContent).not.toContain('<img src=x>');
  expect(body.textContent).toContain(code);
});
