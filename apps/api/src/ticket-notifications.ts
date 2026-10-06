import type { TicketStore, TicketNotificationEvent } from './ticket-store.js';
import { decryptTicketContact } from './ticket-crypto.js';
import {
  EditorialReviewSchema,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';

export type TicketMailer = {
  sendReceipt(input: {
    email: string;
    name?: string;
    ticketCode: string;
  }): Promise<{ messageId: string } | void>;
  send(input: {
    email: string;
    name?: string;
    ticketCode: string;
    responseText: string;
    editorial?: EditorialReview;
    notificationId?: number;
    notificationKey?: string;
    eventType?: TicketNotificationEvent;
  }): Promise<{ messageId: string } | void>;
  delivery?(messageId: string): Promise<{ event: string; occurredAt: string } | null>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function brandedEmail(content: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fa;color:#15385e;font-family:Tahoma,Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" style="max-width:100%;background:#fff;border:1px solid #d8e5ef;border-radius:12px"><tr><td style="padding:24px;border-bottom:1px solid #d8e5ef;font-size:28px;font-weight:bold">بصيرة <span style="color:#008e89;font-size:15px">مراجعة النص والمصدر</span></td></tr><tr><td style="padding:24px;line-height:1.9;text-align:right">${content}</td></tr><tr><td style="padding:20px;color:#6482a2;font-size:12px;border-top:1px solid #d8e5ef">هذه نتيجة مراجعة تحريرية للنص المحدد، وليست فتوى عامة. لا يحتوي رابط المتابعة على بيانات الدخول.</td></tr></table></td></tr></table></body></html>`;
}

function reviewedEmail(review: EditorialReview | undefined): string {
  if (!review) return '';
  return `<h2>خلاصة التقرير</h2><p style="white-space:pre-wrap">${escapeHtml(review.summary)}</p>${review.records
    .filter((row) => row.status !== 'removed')
    .map(
      (row) =>
        `<div style="padding:16px;margin-bottom:12px;border:1px solid #d8e5ef;border-radius:8px"><strong>${escapeHtml(row.originalText)}</strong><p style="white-space:pre-wrap">${escapeHtml(row.correctedText)}</p><p style="white-space:pre-wrap">${escapeHtml(row.explanation)}</p>${row.evidenceIds
          .map((id) => {
            const source = review.evidence.find((item) => item.id === id);
            return source
              ? `<p style="background:#edf8f4;padding:12px"><strong>${escapeHtml(source.work)} — ${escapeHtml(source.reference)}</strong><br>${escapeHtml(source.originalText)}</p>`
              : '';
          })
          .join('')}</div>`,
    )
    .join(
      '',
    )}<h3>حدود المقارنة</h3><p>${escapeHtml(review.limitations)}</p>${review.suggestedText ? `<h3>النص المقترح من المراجع</h3><p style="white-space:pre-wrap">${escapeHtml(review.suggestedText)}</p>` : ''}`;
}

export function createBrevoMailer(options: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  publicAppUrl: string;
  fetch?: typeof fetch;
}): TicketMailer {
  const request = options.fetch ?? fetch;
  const sendMessage = async (body: Record<string, unknown>) => {
    const response = await request('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': options.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`BREVO_HTTP_${response.status}`);
    const result: unknown = await response.json();
    const messageId =
      result && typeof result === 'object' && 'messageId' in result ? result.messageId : null;
    if (typeof messageId !== 'string' || !messageId || messageId.length > 500)
      throw new Error('BREVO_SEND_RESULT_UNKNOWN');
    return { messageId };
  };
  return {
    async sendReceipt(input) {
      const followUpUrl = `${options.publicAppUrl.replace(/\/$/u, '')}/#/follow-up`;
      const safeName = input.name ? escapeHtml(input.name) : '';
      const safeCode = escapeHtml(input.ticketCode);
      const safeUrl = escapeHtml(followUpUrl);
      return sendMessage({
        sender: { email: options.senderEmail, name: options.senderName },
        to: [{ email: input.email, ...(input.name ? { name: input.name } : {}) }],
        subject: `تم إنشاء تذكرتك ${input.ticketCode}`,
        textContent: `مرحبًا${input.name ? ` ${input.name}` : ''}،\n\nتم إنشاء تذكرتك ${input.ticketCode}. احتفظ بالرقم، ثم افتح ${followUpUrl} وأدخل رقم التذكرة مع البريد الإلكتروني نفسه لمتابعة المراجعة.\n\nبصيرة`,
        htmlContent: brandedEmail(
          `<p>مرحبًا${safeName ? ` ${safeName}` : ''}،</p><h2>تم استلام طلب المراجعة</h2><p>رقم التذكرة: <strong dir="ltr">${safeCode}</strong>. احتفظ بهذا الرقم.</p><p><a style="color:#008e89" href="${safeUrl}">متابعة التذكرة في بصيرة</a> باستخدام رقم التذكرة والبريد الإلكتروني نفسه.</p>`,
        ),
        tags: ['basirah-ticket-receipt'],
      });
    },
    async send(input) {
      const followUpUrl = `${options.publicAppUrl.replace(/\/$/u, '')}/#/follow-up`;
      const safeName = input.name ? escapeHtml(input.name) : '';
      const safeCode = escapeHtml(input.ticketCode);
      const safeUrl = escapeHtml(followUpUrl);
      const eventType = input.eventType ?? 'published';
      const updates: Record<Exclude<TicketNotificationEvent, 'published'>, string> = {
        draft_saved: 'حدّث المراجع العمل على تذكرتك. ستصلك الملاحظات والتقرير عند نشر الرد.',
        archived:
          'تم إغلاق تذكرتك. تبقى الملاحظات والتقارير المنشورة في رسائلها السابقة. المتابعة في الموقع غير متاحة أثناء إغلاق التذكرة.',
        restored: 'أُعيد فتح تذكرتك وأصبحت المتابعة في الموقع متاحة من جديد.',
        retrieval_approved:
          'سُجل تحديث على حالة مصادر مراجعة تذكرتك. لا يعني ذلك تغيير نتيجة المراجعة المنشورة أو إتاحة المصدر تلقائيًا للمراجعات المستقبلية.',
      };
      const update = eventType === 'published' ? undefined : updates[eventType];
      if (update) {
        return sendMessage({
          sender: { email: options.senderEmail, name: options.senderName },
          to: [{ email: input.email, ...(input.name ? { name: input.name } : {}) }],
          subject: `${eventType === 'archived' ? 'تم إغلاق تذكرتك' : eventType === 'restored' ? 'أُعيد فتح تذكرتك' : 'تحديث على تذكرتك'} ${input.ticketCode}`,
          textContent: `مرحبًا${input.name ? ` ${input.name}` : ''}،\n\n${update}\nرقم التذكرة: ${input.ticketCode}\n\n${eventType === 'archived' ? '' : `للمتابعة افتح ${followUpUrl} وأدخل رقم التذكرة والبريد الإلكتروني نفسه.\n\n`}بصيرة`,
          htmlContent: brandedEmail(
            `<p>مرحبًا${safeName ? ` ${safeName}` : ''}،</p><h2>تحديث على التذكرة <span dir="ltr">${safeCode}</span></h2><p>${escapeHtml(update)}</p>${eventType === 'archived' ? '' : `<p><a href="${safeUrl}">متابعة التذكرة في بصيرة</a> باستخدام رقم التذكرة والبريد الإلكتروني نفسه.</p>`}`,
          ),
          tags: ['basirah-ticket-update'],
          ...(input.notificationKey
            ? {
                headers: {
                  idempotencyKey: input.notificationKey,
                },
              }
            : {}),
        });
      }
      return sendMessage({
        sender: { email: options.senderEmail, name: options.senderName },
        to: [{ email: input.email, ...(input.name ? { name: input.name } : {}) }],
        subject: `اكتملت مراجعة تذكرتك ${input.ticketCode}`,
        textContent: `مرحبًا${input.name ? ` ${input.name}` : ''}،\n\nاكتملت المراجعة البشرية للتذكرة ${input.ticketCode}.\n\nملاحظات المراجع:\n${input.responseText}\n\n${input.editorial?.summary ?? ''}\n\nلعرض التقرير الكامل والأدلة وما تغير، افتح ${followUpUrl} وأدخل رقم التذكرة مع البريد الإلكتروني نفسه.\n\nبصيرة`,
        htmlContent: brandedEmail(
          `<p>مرحبًا${safeName ? ` ${safeName}` : ''}،</p><h2>اكتملت المراجعة البشرية</h2><p>التذكرة <strong dir="ltr">${safeCode}</strong></p><h3>ملاحظات المراجع ونصيحته</h3><p style="white-space:pre-wrap">${escapeHtml(input.responseText)}</p>${reviewedEmail(input.editorial)}<p><a style="display:inline-block;padding:12px 20px;background:#008e89;color:#fff;text-decoration:none;border-radius:8px" href="${safeUrl}">عرض التقرير والأدلة والتغييرات</a></p><p>أدخل رقم التذكرة مع البريد الإلكتروني نفسه. احتفظ بهذه الرسالة للمراجعة.</p>`,
        ),
        tags: ['basirah-review-ticket'],
        ...(input.notificationKey
          ? {
              headers: {
                idempotencyKey: input.notificationKey,
              },
            }
          : {}),
      });
    },
    async delivery(messageId) {
      const url = new URL('https://api.brevo.com/v3/smtp/statistics/events');
      url.searchParams.set('messageId', messageId);
      url.searchParams.set('limit', '50');
      url.searchParams.set('days', '7');
      const response = await request(url, {
        headers: { accept: 'application/json', 'api-key': options.apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`BREVO_HTTP_${response.status}`);
      const result = (await response.json()) as {
        events?: { messageId?: string; event?: string; date?: string }[];
      };
      const events = (result.events ?? []).filter(
        (row) =>
          row.messageId === messageId &&
          typeof row.date === 'string' &&
          Number.isFinite(Date.parse(row.date)),
      );
      // Opens/clicks are not needed: only retain bounded transport events, never
      // recipient addresses, IPs, raw provider reasons or tracking payloads.
      const terminal = events.find((row) =>
        ['delivered', 'hardBounces', 'softBounces', 'blocked', 'invalid', 'error'].includes(
          row.event ?? '',
        ),
      );
      const selected = terminal ?? events.find((row) => row.event === 'deferred');
      return selected
        ? { event: selected.event!, occurredAt: new Date(selected.date!).toISOString() }
        : null;
    },
  };
}

export function createTicketNotificationWorker(options: {
  store: TicketStore;
  mailer: TicketMailer;
  dataKey: string;
  intervalMs?: number;
}) {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let stopped = false;
  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      for (const job of await options.store.claimNotifications(10)) {
        try {
          const contact = decryptTicketContact(job.contactCiphertext, options.dataKey);
          const ticket = await options.store.get(job.ticketCode);
          if (!ticket) throw new Error('TICKET_ARCHIVED');
          if (ticket.notifyOptIn === false) throw new Error('TICKET_NOTIFICATION_OPTED_OUT');
          // Bind the email to the exact outbox response, never to matching notes
          // (two published versions may legitimately contain identical notes).
          const editorial = EditorialReviewSchema.safeParse(job.editorial);
          if (job.editorial != null && !editorial.success)
            throw new Error('INVALID_EDITORIAL_REPORT');
          const receipt = await options.mailer.send({
            ...contact,
            ticketCode: job.ticketCode,
            responseText: job.responseText,
            notificationId: job.notificationId,
            ...(job.notificationKey ? { notificationKey: job.notificationKey } : {}),
            ...(job.eventType ? { eventType: job.eventType } : {}),
            ...(editorial.success ? { editorial: editorial.data } : {}),
          });
          if (receipt && options.store.recordEmailReceipt) {
            try {
              if (
                !(await options.store.recordEmailReceipt(
                  job.ticketCode,
                  job.notificationId,
                  receipt.messageId,
                ))
              )
                throw new Error('receipt not persisted');
            } catch {
              throw new Error('EMAIL_ACCEPTED_AUDIT_FAILED');
            }
          }
          await options.store.completeNotification(job.notificationId, true);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const code =
            /^(BREVO_HTTP_\d{3}|BREVO_SEND_RESULT_UNKNOWN|EMAIL_ACCEPTED_AUDIT_FAILED|TICKET_ARCHIVED|TICKET_NOTIFICATION_OPTED_OUT|INVALID_EDITORIAL_REPORT)$/u.test(
              message,
            )
              ? message
              : 'EMAIL_SEND_RESULT_UNKNOWN';
          await options.store.completeNotification(job.notificationId, false, code);
        }
      }
      if (
        options.mailer.delivery &&
        options.store.pendingEmailDeliveries &&
        options.store.recordEmailDelivery
      ) {
        for (const item of await options.store.pendingEmailDeliveries(10)) {
          try {
            const event = await options.mailer.delivery(item.messageId);
            await options.store.recordEmailDelivery(
              item.id,
              event?.event ?? 'accepted',
              event?.occurredAt ?? null,
            );
          } catch {
            /* Provider observability failure is not a resend request. */
          }
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => void drain().catch(() => {}), options.intervalMs ?? 30_000);
      timer.unref();
      void drain().catch(() => {});
    },
    notify() {
      void drain().catch(() => {});
    },
    async sendReceipt(input: { email: string; name?: string; ticketCode: string }) {
      const receipt = await options.mailer.sendReceipt(input);
      if (
        receipt &&
        options.store.recordEmailReceipt &&
        !(await options.store.recordEmailReceipt(input.ticketCode, null, receipt.messageId))
      )
        throw new Error('EMAIL_ACCEPTED_AUDIT_FAILED');
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      while (running) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
