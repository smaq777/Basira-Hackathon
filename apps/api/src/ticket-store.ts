import { Pool } from 'pg';
import { z } from 'zod';
import { databaseTls } from './database.js';

const TicketReceiptSchema = z
  .object({
    ticketCode: z.string().regex(/^BR-[A-Z0-9]{12}$/u),
    status: z.enum(['pending', 'in_review', 'published', 'closed']),
    hasEmail: z.boolean(),
    notifyOptIn: z.boolean(),
    createdAt: z.coerce.date().transform((date) => date.toISOString()),
  })
  .strict();

const ReviewerResponseSchema = z
  .object({
    ticketCode: z.string(),
    version: z.number().int().positive(),
    decision: z.enum(['needs_context', 'bounded_revision', 'returned']),
    text: z.string(),
    published: z.boolean(),
    createdAt: z.coerce.date().transform((date) => date.toISOString()),
  })
  .strict();

export type TicketReceipt = z.infer<typeof TicketReceiptSchema>;
export type ReviewerDecision = z.infer<typeof ReviewerResponseSchema>['decision'];

export type NotificationClaim = {
  notificationId: number;
  ticketCode: string;
  contactCiphertext: Buffer;
  responseText: string;
};

export interface TicketStore {
  create(
    sessionId: string,
    secret: string,
    reviewId: string,
    ticketCode: string,
    emailHash: Buffer | null,
    contactCiphertext: Buffer | null,
    notify: boolean,
  ): Promise<TicketReceipt | null>;
  createForRevision(
    sessionId: string,
    secret: string,
    revisionId: string,
    ticketCode: string,
    emailHash: Buffer | null,
    contactCiphertext: Buffer | null,
    notify: boolean,
  ): Promise<TicketReceipt | null>;
  updateContact(
    sessionId: string,
    secret: string,
    ticketCode: string,
    emailHash: Buffer,
    contactCiphertext: Buffer,
    notify: boolean,
  ): Promise<TicketReceipt | null>;
  lookup(ticketCode: string, emailHash: Buffer): Promise<Record<string, unknown>>;
  list(): Promise<unknown[]>;
  get(ticketCode: string): Promise<Record<string, unknown> | null>;
  saveResponse(
    ticketCode: string,
    reviewerUserId: string,
    decision: ReviewerDecision,
    text: string,
    publish: boolean,
  ): Promise<z.infer<typeof ReviewerResponseSchema> | null>;
  approveForRetrieval(
    ticketCode: string,
    reviewerUserId: string,
    sourceReference: string,
    provenance: Record<string, unknown>,
  ): Promise<boolean>;
  claimNotifications(limit: number): Promise<NotificationClaim[]>;
  completeNotification(id: number, sent: boolean, errorCode?: string): Promise<boolean>;
  close(): Promise<void>;
}

export const unavailableTicketStore: TicketStore = {
  async create() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async createForRevision() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async updateContact() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async lookup() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async list() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async get() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async saveResponse() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async approveForRetrieval() {
    throw new Error('TICKET_STORE_UNAVAILABLE');
  },
  async claimNotifications() {
    return [];
  },
  async completeNotification() {
    return false;
  },
  async close() {},
};

function securedConnectionString(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid DATABASE_URL');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

export function createTicketStore(connectionString: string): TicketStore {
  const pool = new Pool({
    connectionString: securedConnectionString(connectionString),
    ssl: databaseTls(),
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    application_name: 'basirah-ticket-api',
  });
  return {
    async create(sessionId, secret, reviewId, code, hash, ciphertext, notify) {
      const result = await pool.query<{ value: unknown }>(
        'select basirah_api.create_review_ticket($1::uuid,$2,$3::uuid,$4,$5,$6,$7) as value',
        [sessionId, secret, reviewId, code, hash, ciphertext, notify],
      );
      const value = result.rows[0]?.value;
      return value == null ? null : TicketReceiptSchema.parse(value);
    },
    async createForRevision(sessionId, secret, revisionId, code, hash, ciphertext, notify) {
      const result = await pool.query<{ value: unknown }>(
        'select basirah_api.create_revision_review_ticket($1::uuid,$2,$3::uuid,$4,$5,$6,$7) as value',
        [sessionId, secret, revisionId, code, hash, ciphertext, notify],
      );
      const value = result.rows[0]?.value;
      return value == null ? null : TicketReceiptSchema.parse(value);
    },
    async updateContact(sessionId, secret, code, hash, ciphertext, notify) {
      const result = await pool.query<{ value: unknown }>(
        'select basirah_api.update_review_ticket_contact($1::uuid,$2,$3,$4,$5,$6) as value',
        [sessionId, secret, code, hash, ciphertext, notify],
      );
      const value = result.rows[0]?.value;
      return value == null ? null : TicketReceiptSchema.parse(value);
    },
    async lookup(code, hash) {
      const result = await pool.query<{ value: Record<string, unknown> }>(
        'select basirah_api.lookup_review_ticket($1,$2) as value',
        [code, hash],
      );
      return result.rows[0]?.value ?? { found: false };
    },
    async list() {
      const result = await pool.query<{ value: unknown[] }>(
        'select basirah_api.list_review_tickets() as value',
      );
      return result.rows[0]?.value ?? [];
    },
    async get(code) {
      const result = await pool.query<{ value: Record<string, unknown> | null }>(
        'select basirah_api.get_review_ticket($1) as value',
        [code],
      );
      return result.rows[0]?.value ?? null;
    },
    async saveResponse(code, reviewer, decision, text, publish) {
      const result = await pool.query<{ value: unknown }>(
        'select basirah_api.save_review_ticket_response($1,$2,$3,$4,$5) as value',
        [code, reviewer, decision, text, publish],
      );
      const value = result.rows[0]?.value;
      return value == null ? null : ReviewerResponseSchema.parse(value);
    },
    async approveForRetrieval(code, reviewer, sourceReference, provenance) {
      const result = await pool.query<{ value: boolean }>(
        'select basirah_api.approve_review_response_for_retrieval($1,$2,$3,$4::jsonb) as value',
        [code, reviewer, sourceReference, JSON.stringify(provenance)],
      );
      return result.rows[0]?.value === true;
    },
    async claimNotifications(limit) {
      const result = await pool.query<{
        notification_id: number;
        ticket_code: string;
        contact_ciphertext: Buffer;
        response_text: string;
      }>('select * from basirah_api.claim_review_notifications($1)', [limit]);
      return result.rows.map((row) => ({
        notificationId: Number(row.notification_id),
        ticketCode: row.ticket_code,
        contactCiphertext: row.contact_ciphertext,
        responseText: row.response_text,
      }));
    },
    async completeNotification(id, sent, errorCode) {
      const result = await pool.query<{ value: boolean }>(
        'select basirah_api.complete_review_notification($1,$2,$3) as value',
        [id, sent, errorCode ?? null],
      );
      return result.rows[0]?.value === true;
    },
    async close() {
      await pool.end();
    },
  };
}
