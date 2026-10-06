import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  EditorialReviewSchema,
  initialEditorialReview,
  type EditorialReview,
} from '../packages/contracts/src/editorial-review.js';
import { createApp } from '../apps/api/src/app.js';
import { unavailableTicketStore } from '../apps/api/src/ticket-store.js';
import { createTicketNotificationWorker } from '../apps/api/src/ticket-notifications.js';
import { encryptTicketContact } from '../apps/api/src/ticket-crypto.js';

const code = 'BR-A1B2C3D4E5F6';
const review: EditorialReview = {
  ...initialEditorialReview(null),
  summary: 'تحقق بشري موثق',
  evidence: [
    {
      id: 'source-1',
      work: 'كتاب تجريبي',
      author: 'مؤلف تجريبي',
      edition: 'طبعة اختبار',
      reference: 'باب 1',
      sourceUrl: 'https://example.com/source',
      originalText: 'نص مرجعي تجريبي لمطابقة السجل',
      context: '',
      sourceRole: 'book_excerpt',
    },
  ],
  records: [
    {
      id: 'record-1',
      kind: 'quotation',
      originalText: 'نص مرجعي تجريبي لمطابقة السجل',
      status: 'matched',
      correctedText: '',
      explanation: 'مطابقة نصية',
      evidenceIds: ['source-1'],
    },
  ],
};
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});
async function serve(allowedUserIds = ['reviewer']) {
  const store = {
    ...unavailableTicketStore,
    get: vi.fn().mockResolvedValue({
      status: 'published',
      responses: [{ version: 1, published: true, editorial: review }],
    }),
    recordSourceReceipt: vi.fn().mockResolvedValue(true),
    saveResponse: vi.fn().mockResolvedValue({ version: 2, published: true }),
    page: vi.fn().mockResolvedValue({
      tickets: [],
      total: 0,
      counts: { pending: 0, inReview: 0, published: 0, total: 0 },
    }),
  };
  const corpus = {
    approve: vi.fn().mockResolvedValue({ snapshotKey: `reviewed-${'a'.repeat(32)}` }),
  };
  const notification = { notify: vi.fn() };
  const server = createApp({
    production: false,
    reviewerAuth: {
      configured: true,
      authorizationConfigured: true,
      accessMode: 'allowlist',
      middleware: (_req, _res, next) => next(),
      resolve: async (req) =>
        req.header('authorization') === 'Bearer reviewer'
          ? { state: 'allowed', userId: 'reviewer' }
          : { state: 'unauthenticated' },
    },
    tickets: {
      store,
      dataKey: Buffer.alloc(32).toString('base64'),
      lookupPepper: 'p'.repeat(40),
      notifications: notification,
    },
    reviewerCorpus: { store: corpus, allowedUserIds },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, auth = true) =>
    fetch(`${base}/api/v1/reviewer/tickets/${code}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: 'Bearer reviewer' } : {}),
      },
      body: JSON.stringify(body),
    });
  return { store, corpus, notification, post, base };
}
describe('evidence-bounded human review', () => {
  it('rejects invented resolution, orphan references, unsafe links and unsupported suggestions', () => {
    expect(EditorialReviewSchema.safeParse(review).success).toBe(true);
    expect(
      EditorialReviewSchema.safeParse({
        ...review,
        records: [{ ...review.records[0], evidenceIds: [] }],
      }).success,
    ).toBe(false);
    expect(
      EditorialReviewSchema.safeParse({
        ...review,
        records: [{ ...review.records[0], evidenceIds: ['missing'] }],
      }).success,
    ).toBe(false);
    expect(
      EditorialReviewSchema.safeParse({
        ...review,
        evidence: [{ ...review.evidence[0], sourceUrl: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
    expect(
      EditorialReviewSchema.safeParse({
        ...initialEditorialReview(null),
        suggestedText: 'بلا دليل',
      }).success,
    ).toBe(false);
    expect(
      EditorialReviewSchema.safeParse({
        ...review,
        suggestedText: 'اقتراح غير محسوم',
        records: [{ ...review.records[0], status: 'unresolved' }],
      }).success,
    ).toBe(false);
    expect(
      EditorialReviewSchema.safeParse({
        ...review,
        records: [{ ...review.records[0], originalText: '' }],
      }).success,
    ).toBe(false);
  });
  it('publishes directly and refuses an editorial draft', async () => {
    const app = await serve();
    const input = {
      decision: 'bounded_revision',
      text: 'ملاحظة للمستخدم',
      editorial: review,
      expectedVersion: 1,
    };
    expect((await app.post('responses', { ...input, publish: false })).status).toBe(400);
    expect(app.store.saveResponse).not.toHaveBeenCalled();
    expect((await app.post('responses', { ...input, publish: true })).status).toBe(201);
    expect(app.store.saveResponse).toHaveBeenCalledWith(
      code,
      'reviewer',
      'bounded_revision',
      'ملاحظة للمستخدم',
      true,
      { expectedVersion: 1, report: review },
    );
    expect(app.notification.notify).toHaveBeenCalledOnce();
  });
  it('requires curator authorization, publication version and linked evidence before RAG insertion', async () => {
    const app = await serve();
    const input = {
      version: 1,
      evidenceId: 'source-1',
      rightsRecord: 'Synthetic test fixture permission',
      confirmed: true,
    };
    expect((await app.post('source-approval', input, false)).status).toBe(401);
    expect((await app.post('source-approval', { ...input, version: 2 })).status).toBe(409);
    expect((await app.post('source-approval', { ...input, evidenceId: 'missing' })).status).toBe(
      422,
    );
    expect(app.corpus.approve).not.toHaveBeenCalled();
    const response = await app.post('source-approval', input);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ addedToRetrieval: true, auditRecorded: true });
    const forbidden = await serve([]);
    expect((await forbidden.post('source-approval', input)).status).toBe(403);
    expect(forbidden.corpus.approve).not.toHaveBeenCalled();
  });
  it('reports persisted RAG evidence honestly if the separate audit write fails', async () => {
    const app = await serve();
    app.store.recordSourceReceipt.mockRejectedValueOnce(new Error('unavailable'));
    const response = await app.post('source-approval', {
      version: 1,
      evidenceId: 'source-1',
      rightsRecord: 'Synthetic fixture permission',
      confirmed: true,
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ addedToRetrieval: true, auditRecorded: false });
  });
  it('sends the exact outbox version, not another version with identical notes', async () => {
    const dataKey = Buffer.alloc(32, 7).toString('base64');
    const store = {
      ...unavailableTicketStore,
      claimNotifications: vi.fn().mockResolvedValue([
        {
          notificationId: 1,
          ticketCode: code,
          contactCiphertext: encryptTicketContact({ email: 'synthetic@example.com' }, dataKey),
          responseText: 'same note',
          responseVersion: 1,
          editorial: review,
        },
      ]),
      get: vi.fn().mockResolvedValue({
        status: 'published',
        responses: [
          {
            version: 2,
            text: 'same note',
            published: true,
            editorial: { ...review, summary: 'Wrong version' },
          },
        ],
      }),
      completeNotification: vi.fn().mockResolvedValue(true),
    };
    const mailer = { send: vi.fn().mockResolvedValue(undefined), sendReceipt: vi.fn() };
    const worker = createTicketNotificationWorker({ store, mailer, dataKey });
    worker.notify();
    await vi.waitFor(() => expect(mailer.send).toHaveBeenCalledOnce());
    await worker.stop();
    expect(mailer.send.mock.calls[0]?.[0]).toMatchObject({
      editorial: { summary: review.summary },
    });
  });
});
