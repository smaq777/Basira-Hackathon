import { describe, it, expect, vi } from 'vitest';
import {
  createBrevoMailer,
  createTicketNotificationWorker,
} from '../apps/api/src/ticket-notifications.js';
import { unavailableTicketStore } from '../apps/api/src/ticket-store.js';
import { encryptTicketContact } from '../apps/api/src/ticket-crypto.js';

const code = 'BR-156QA0000001';
function mailer(request: typeof fetch) {
  return createBrevoMailer({
    apiKey: 'synthetic-key',
    senderEmail: 'sender@example.com',
    senderName: 'بصيرة',
    publicAppUrl: 'https://example.com',
    fetch: request,
  });
}
describe('email delivery evidence', () => {
  it('requires a provider message ID, rather than interpreting any 2xx as delivered', async () => {
    const good = mailer(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('{"messageId":"<test@provider.example>"}', { status: 201 }),
        ),
    );
    expect(
      await good.send({ email: 'synthetic@example.com', ticketCode: code, responseText: 'ملاحظة' }),
    ).toEqual({ messageId: '<test@provider.example>' });
    const unknown = mailer(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 })),
    );
    await expect(
      unknown.sendReceipt({ email: 'synthetic@example.com', ticketCode: code }),
    ).rejects.toThrow('BREVO_SEND_RESULT_UNKNOWN');
  });
  it('accepts only matching-ID transport events and never confuses requests or opens with delivery', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            { messageId: '<other>', event: 'delivered', date: '2026-10-06T01:00:00Z' },
            { messageId: '<test>', event: 'opened', date: '2026-10-06T01:00:00Z' },
            { messageId: '<test>', event: 'requests', date: '2026-10-06T01:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );
    expect(await mailer(request).delivery!('<test>')).toBeNull();
    request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          events: [
            {
              messageId: '<test>',
              event: 'delivered',
              date: '2026-10-06T01:01:00Z',
              email: 'private@example.com',
              reason: 'private',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    expect(await mailer(request).delivery!('<test>')).toEqual({
      event: 'delivered',
      occurredAt: '2026-10-06T01:01:00.000Z',
    });
    expect(String(request.mock.calls[0]?.[0])).toContain('messageId=%3Ctest%3E');
  });
  it('persists exact-version acceptance then polls delivery without sending again', async () => {
    const dataKey = Buffer.alloc(32, 9).toString('base64');
    const store = {
      ...unavailableTicketStore,
      get: vi.fn().mockResolvedValue({ status: 'published' }),
      claimNotifications: vi
        .fn()
        .mockResolvedValueOnce([
          {
            notificationId: 8,
            notificationKey: '78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3',
            ticketCode: code,
            responseVersion: 2,
            responseText: 'نصيحة',
            contactCiphertext: encryptTicketContact({ email: 'synthetic@example.com' }, dataKey),
          },
        ])
        .mockResolvedValue([]),
      recordEmailReceipt: vi.fn().mockResolvedValue(true),
      pendingEmailDeliveries: vi.fn().mockResolvedValue([{ id: 9, messageId: '<test>' }]),
      recordEmailDelivery: vi.fn().mockResolvedValue(true),
      completeNotification: vi.fn().mockResolvedValue(true),
    };
    const transport = {
      sendReceipt: vi.fn(),
      send: vi.fn().mockResolvedValue({ messageId: '<test>' }),
      delivery: vi
        .fn()
        .mockResolvedValue({ event: 'delivered', occurredAt: '2026-10-06T01:01:00.000Z' }),
    };
    const worker = createTicketNotificationWorker({ store, mailer: transport, dataKey });
    worker.notify();
    await vi.waitFor(() =>
      expect(store.recordEmailDelivery).toHaveBeenCalledWith(
        9,
        'delivered',
        '2026-10-06T01:01:00.000Z',
      ),
    );
    await worker.stop();
    expect(store.recordEmailReceipt).toHaveBeenCalledWith(code, 8, '<test>');
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationKey: '78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3',
      }),
    );
    expect(store.completeNotification).toHaveBeenCalledWith(8, true);
    expect(transport.send).toHaveBeenCalledOnce();
  });
  it('does not leak transport exceptions or mark ambiguous acceptance as delivered', async () => {
    const dataKey = Buffer.alloc(32, 9).toString('base64');
    const store = {
      ...unavailableTicketStore,
      get: vi.fn().mockResolvedValue({ status: 'published' }),
      claimNotifications: vi.fn().mockResolvedValue([
        {
          notificationId: 8,
          ticketCode: code,
          responseText: 'نصيحة',
          contactCiphertext: encryptTicketContact({ email: 'synthetic@example.com' }, dataKey),
        },
      ]),
      completeNotification: vi.fn().mockResolvedValue(true),
    };
    const transport = {
      sendReceipt: vi.fn(),
      send: vi.fn().mockRejectedValue(new Error('private email/token transport error')),
    };
    const worker = createTicketNotificationWorker({ store, mailer: transport, dataKey });
    worker.notify();
    await vi.waitFor(() =>
      expect(store.completeNotification).toHaveBeenCalledWith(
        8,
        false,
        'EMAIL_SEND_RESULT_UNKNOWN',
      ),
    );
    await worker.stop();
  });
});

describe('post-intake ticket communication', () => {
  it('uses the same durable UUID for retries of published mail, and distinct UUIDs for new jobs', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response('{"messageId":"<update@example.com>"}', { status: 201 }),
      );
    const keys = [
      '78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3',
      '78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3',
      '6e5f1864-846d-4df3-b47c-2367bbfa87ed',
    ];
    for (const notificationKey of keys) {
      await mailer(request).send({
        email: 'synthetic@example.com',
        ticketCode: code,
        responseText: 'Published note',
        notificationId: 12,
        notificationKey,
      });
    }
    const payloads = request.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(payloads.map((p) => p.headers.idempotencyKey)).toEqual(keys);
    for (const payload of payloads) {
      expect(payload.headers.idempotencyKey).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
      );
      expect(payload.htmlContent).toContain('Published note');
      expect(payload.subject).toContain('اكتملت');
    }
  });
  it.each(['draft_saved', 'archived', 'restored', 'retrieval_approved'] as const)(
    'renders %s as an update without disclosing unpublished content',
    async (eventType) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"messageId":"<update@example.com>"}', { status: 201 }));
      await mailer(request).send({
        email: 'synthetic@example.com',
        ticketCode: code,
        responseText: 'PRIVATE DRAFT',
        eventType,
        notificationId: 12,
        notificationKey: '78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3',
      });
      const payload = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
      expect(payload.subject).toContain(code);
      expect(payload.subject).not.toContain('اكتملت');
      expect(payload.htmlContent).not.toContain('PRIVATE DRAFT');
      expect(payload.textContent).not.toContain('PRIVATE DRAFT');
      expect(payload.headers.idempotencyKey).toBe('78f281c0-96f6-4d0f-a6bc-fbb68d89a5a3');
      expect(payload.tags).toEqual(['basirah-ticket-update']);
      if (eventType === 'archived') expect(payload.htmlContent).not.toContain('href=');
    },
  );
  it('delivers a closure notice and earlier published communication for a closed ticket', async () => {
    const dataKey = Buffer.alloc(32, 9).toString('base64');
    const store = {
      ...unavailableTicketStore,
      get: vi.fn().mockResolvedValue({ status: 'closed', notifyOptIn: true }),
      claimNotifications: vi
        .fn()
        .mockResolvedValueOnce(
          ['published', 'archived'].map((eventType, i) => ({
            notificationId: i + 1,
            ticketCode: code,
            eventType,
            responseText: i ? '' : 'Published note',
            contactCiphertext: encryptTicketContact({ email: 'synthetic@example.com' }, dataKey),
          })),
        )
        .mockResolvedValue([]),
      completeNotification: vi.fn().mockResolvedValue(true),
      recordEmailReceipt: vi.fn().mockResolvedValue(true),
    };
    const transport = {
      sendReceipt: vi.fn(),
      send: vi.fn().mockResolvedValue({ messageId: '<update>' }),
    };
    const worker = createTicketNotificationWorker({ store, mailer: transport, dataKey });
    worker.notify();
    await vi.waitFor(() => expect(store.completeNotification).toHaveBeenCalledTimes(2));
    await worker.stop();
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(transport.send.mock.calls[1]?.[0]).toMatchObject({
      eventType: 'archived',
      responseText: '',
    });
  });
  it('honors consent withdrawn after claiming a job', async () => {
    const dataKey = Buffer.alloc(32, 9).toString('base64');
    const store = {
      ...unavailableTicketStore,
      get: vi.fn().mockResolvedValue({ status: 'published', notifyOptIn: false }),
      claimNotifications: vi
        .fn()
        .mockResolvedValueOnce([
          {
            notificationId: 3,
            ticketCode: code,
            eventType: 'published',
            responseText: 'Published note',
            contactCiphertext: encryptTicketContact({ email: 'synthetic@example.com' }, dataKey),
          },
        ])
        .mockResolvedValue([]),
      completeNotification: vi.fn().mockResolvedValue(true),
    };
    const transport = { sendReceipt: vi.fn(), send: vi.fn() };
    const worker = createTicketNotificationWorker({ store, mailer: transport, dataKey });
    worker.notify();
    await vi.waitFor(() =>
      expect(store.completeNotification).toHaveBeenCalledWith(
        3,
        false,
        'TICKET_NOTIFICATION_OPTED_OUT',
      ),
    );
    await worker.stop();
    expect(transport.send).not.toHaveBeenCalled();
  });
});
