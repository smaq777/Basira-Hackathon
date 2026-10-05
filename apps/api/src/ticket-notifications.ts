import type { TicketStore } from './ticket-store.js';
import { decryptTicketContact } from './ticket-crypto.js';

export type TicketMailer = {
  sendReceipt(input: { email: string; name?: string; ticketCode: string }): Promise<void>;
  send(input: {
    email: string;
    name?: string;
    ticketCode: string;
    responseText: string;
  }): Promise<void>;
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
  };
  return {
    async sendReceipt(input) {
      const followUpUrl = `${options.publicAppUrl.replace(/\/$/u, '')}/#/follow-up`;
      const safeName = input.name ? escapeHtml(input.name) : '';
      const safeCode = escapeHtml(input.ticketCode);
      const safeUrl = escapeHtml(followUpUrl);
      await sendMessage({
        sender: { email: options.senderEmail, name: options.senderName },
        to: [{ email: input.email, ...(input.name ? { name: input.name } : {}) }],
        subject: `تم إنشاء تذكرتك ${input.ticketCode}`,
        textContent: `مرحبًا${input.name ? ` ${input.name}` : ''}،\n\nتم إنشاء تذكرتك ${input.ticketCode}. احتفظ بالرقم، ثم افتح ${followUpUrl} وأدخل رقم التذكرة مع البريد الإلكتروني نفسه لمتابعة المراجعة.\n\nبصيرة`,
        htmlContent: `<div dir="rtl" lang="ar"><p>مرحبًا${safeName ? ` ${safeName}` : ''}،</p><p>تم إنشاء تذكرتك <strong>${safeCode}</strong>. احتفظ بهذا الرقم لمتابعة المراجعة.</p><p><a href="${safeUrl}">متابعة التذكرة في بصيرة</a> باستخدام رقم التذكرة والبريد الإلكتروني نفسه.</p><p>بصيرة</p></div>`,
        tags: ['basirah-ticket-receipt'],
      });
    },
    async send(input) {
      const followUpUrl = `${options.publicAppUrl.replace(/\/$/u, '')}/#/follow-up`;
      const safeName = input.name ? escapeHtml(input.name) : '';
      const safeCode = escapeHtml(input.ticketCode);
      const safeUrl = escapeHtml(followUpUrl);
      await sendMessage({
        sender: { email: options.senderEmail, name: options.senderName },
        to: [{ email: input.email, ...(input.name ? { name: input.name } : {}) }],
        subject: `اكتملت مراجعة تذكرتك ${input.ticketCode}`,
        textContent: `مرحبًا${input.name ? ` ${input.name}` : ''}،\n\nاكتملت المراجعة البشرية للتذكرة ${input.ticketCode}. لمتابعة النتيجة، افتح ${followUpUrl} وأدخل رقم التذكرة مع البريد الإلكتروني نفسه.\n\nبصيرة`,
        htmlContent: `<div dir="rtl" lang="ar"><p>مرحبًا${safeName ? ` ${safeName}` : ''}،</p><p>اكتملت المراجعة البشرية للتذكرة <strong>${safeCode}</strong>.</p><p><a href="${safeUrl}">افتح بصيرة</a> ثم أدخل رقم التذكرة مع البريد الإلكتروني نفسه لعرض النتيجة.</p><p>بصيرة</p></div>`,
        tags: ['basirah-review-ticket'],
      });
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
          await options.mailer.send({
            ...contact,
            ticketCode: job.ticketCode,
            responseText: job.responseText,
          });
          await options.store.completeNotification(job.notificationId, true);
        } catch (error) {
          const code = error instanceof Error ? error.message.slice(0, 120) : 'EMAIL_SEND_FAILED';
          await options.store.completeNotification(job.notificationId, false, code);
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => void drain(), options.intervalMs ?? 30_000);
      timer.unref();
      void drain();
    },
    notify() {
      void drain();
    },
    async sendReceipt(input: { email: string; name?: string; ticketCode: string }) {
      await options.mailer.sendReceipt(input);
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      while (running) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
