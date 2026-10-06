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
