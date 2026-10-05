import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

export type DatabaseReadiness = {
  ready: boolean;
  migrationVersion?: string;
  databaseName?: string;
  serverVersion?: string;
  reason?: 'not_configured' | 'unreachable' | 'migration_missing';
};

export type GuestSession = {
  publicId: string;
  ownershipSecret: string;
  expiresAt: string;
};

export type DocumentRevision = {
  documentId: string;
  revisionId: string;
  version: number;
};

export type OwnedRevision = DocumentRevision & { text: string };

export type ReviewRunStatus =
  | 'queued'
  | 'retrieving'
  | 'checking'
  | 'assessing'
  | 'validating'
  | 'completed'
  | 'partial'
  | 'needs_review'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ReviewRun = {
  reviewId: string;
  revisionId: string;
  status: ReviewRunStatus;
  attempt: number;
  corpusVersion: string;
  createdAt: string;
  deadlineAt: string;
  completedAt: string | null;
};

export type CreatedReviewRun = ReviewRun & { replayed: boolean };

export interface BackendDatabase {
  readiness(): Promise<DatabaseReadiness>;
  purgeExpiredGuestSessions(limit: number): Promise<number>;
  createGuestSession(retentionHours: number): Promise<GuestSession>;
  deleteGuestSession(publicId: string, ownershipSecret: string): Promise<boolean>;
  createDocument(
    publicId: string,
    ownershipSecret: string,
    text: string,
  ): Promise<DocumentRevision>;
  createRevision(
    publicId: string,
    ownershipSecret: string,
    documentPublicId: string,
    text: string,
  ): Promise<DocumentRevision | null>;
  getRevision(
    publicId: string,
    ownershipSecret: string,
    revisionPublicId: string,
  ): Promise<OwnedRevision | null>;
  createReviewRun(
    publicId: string,
    ownershipSecret: string,
    revisionPublicId: string,
    idempotencyKey: string,
    deadlineSeconds: number,
    corpusVersion: string,
  ): Promise<CreatedReviewRun | null>;
  getReviewRun(
    publicId: string,
    ownershipSecret: string,
    reviewPublicId: string,
  ): Promise<ReviewRun | null>;
  cancelReviewRun(
    publicId: string,
    ownershipSecret: string,
    reviewPublicId: string,
  ): Promise<ReviewRun | null>;
  close(): Promise<void>;
}

export class OwnershipError extends Error {
  constructor() {
    super('INVALID_OR_EXPIRED_SESSION');
  }
}

export class ResourceLimitError extends Error {
  constructor(public readonly resource: 'documents' | 'revisions' | 'reviews') {
    super('RESOURCE_LIMIT_REACHED');
  }
}

export class DatabaseUnavailable implements BackendDatabase {
  async readiness(): Promise<DatabaseReadiness> {
    return { ready: false, reason: 'not_configured' };
  }

  async createGuestSession(): Promise<GuestSession> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async purgeExpiredGuestSessions(): Promise<number> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async deleteGuestSession(): Promise<boolean> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async createDocument(): Promise<DocumentRevision> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async createRevision(): Promise<DocumentRevision | null> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async getRevision(): Promise<OwnedRevision | null> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async createReviewRun(): Promise<CreatedReviewRun | null> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async getReviewRun(): Promise<ReviewRun | null> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async cancelReviewRun(): Promise<ReviewRun | null> {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  async close(): Promise<void> {}
}

function securedConnectionString(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid DATABASE_URL');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

export function databaseTls(
  mode = process.env.DATABASE_TLS_MODE,
  environment: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: boolean; ca?: string } {
  const selected = mode?.trim() || 'verify-full';
  const ca = environment.DATABASE_CA_CERT?.replace(/\\n/gu, '\n').trim();
  const productionDeployment =
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT === 'production' ||
    environment.RAILWAY_ENVIRONMENT_NAME === 'production';
  if (productionDeployment && selected !== 'verify-full')
    throw new Error('Production database connections require DATABASE_TLS_MODE=verify-full');
  if (selected === 'verify-full') return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
  if (selected === 'require') return { rejectUnauthorized: false, ...(ca ? { ca } : {}) };
  if (selected === 'disable') return false;
  throw new Error('DATABASE_TLS_MODE must be verify-full, require, or disable');
}

function digest(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

type ReviewRunRow = {
  public_id: string;
  revision_public_id: string;
  status: ReviewRunStatus;
  attempt: number;
  corpus_version: string;
  created_at: Date;
  deadline_at: Date;
  completed_at: Date | null;
};

function reviewRun(row: ReviewRunRow): ReviewRun {
  return {
    reviewId: row.public_id,
    revisionId: row.revision_public_id,
    status: row.status,
    attempt: row.attempt,
    corpusVersion: row.corpus_version,
    createdAt: row.created_at.toISOString(),
    deadlineAt: row.deadline_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

async function authenticate(client: PoolClient, publicId: string, secret: string): Promise<void> {
  const result = await client.query<{ session_id: string | null }>(
    'select basirah_api.authenticate_guest($1::uuid, $2::text) as session_id',
    [publicId, secret],
  );
  if (!result.rows[0]?.session_id) throw new OwnershipError();
}

export function createDatabase(connectionString: string): BackendDatabase {
  const pool = new Pool({
    connectionString: securedConnectionString(connectionString),
    ssl: databaseTls(),
    max: 4,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    application_name: 'basirah-api',
  });

  async function withSerializable<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await pool.connect();
      try {
        await client.query('begin isolation level serializable');
        await client.query("set local statement_timeout = '15s'");
        await client.query("set local lock_timeout = '3s'");
        const value = await operation(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        if (attempt < 3 && ['40001', '40P01'].includes(code)) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('SERIALIZABLE_RETRY_EXHAUSTED');
  }

  return {
    async readiness() {
      try {
        const result = await pool.query<{
          migration_version: string | null;
          database_name: string;
          server_version: string;
        }>('select * from basirah_api.readiness()');
        const row = result.rows[0];
        if (!row?.migration_version) return { ready: false, reason: 'migration_missing' } as const;
        return {
          ready: true,
          migrationVersion: row.migration_version,
          databaseName: row.database_name,
          serverVersion: row.server_version,
        };
      } catch {
        return { ready: false, reason: 'unreachable' } as const;
      }
    },

    async createGuestSession(retentionHours) {
      const result = await pool.query<{
        session_public_id: string;
        ownership_secret: string;
        expires_at: Date;
      }>('select * from basirah_api.create_guest_session($1)', [retentionHours]);
      const row = result.rows[0];
      if (!row) throw new Error('SESSION_CREATION_FAILED');
      return {
        publicId: row.session_public_id,
        ownershipSecret: row.ownership_secret,
        expiresAt: row.expires_at.toISOString(),
      };
    },

    async purgeExpiredGuestSessions(limit) {
      const result = await pool.query<{ purged: number }>(
        'select basirah_api.purge_expired_guest_sessions($1) as purged',
        [limit],
      );
      return Number(result.rows[0]?.purged ?? 0);
    },

    async deleteGuestSession(publicId, ownershipSecret) {
      const result = await pool.query<{ deleted: boolean }>(
        'select basirah_api.delete_guest_session($1::uuid, $2::text) as deleted',
        [publicId, ownershipSecret],
      );
      return result.rows[0]?.deleted === true;
    },

    async createDocument(publicId, ownershipSecret, text) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        const existing = await client.query<{ count: number }>(
          'select count(*)::int as count from basirah.document',
        );
        if ((existing.rows[0]?.count ?? 0) >= 20) throw new ResourceLimitError('documents');
        const document = await client.query<{ id: string; public_id: string }>(
          `insert into basirah.document (session_id)
           values ((select basirah_private.current_session_id()))
           returning id, public_id`,
        );
        const row = document.rows[0];
        if (!row) throw new Error('DOCUMENT_CREATION_FAILED');
        const revision = await client.query<{ id: string; public_id: string; version: number }>(
          `insert into basirah.document_revision
             (document_id, parent_revision_id, version, original_text, content_hash)
           values ($1, null, 1, $2, $3)
           returning id, public_id, version`,
          [row.id, text, digest(text)],
        );
        const revisionRow = revision.rows[0];
        if (!revisionRow) throw new Error('REVISION_CREATION_FAILED');
        await client.query('update basirah.document set current_revision_id = $1 where id = $2', [
          revisionRow.id,
          row.id,
        ]);
        return {
          documentId: row.public_id,
          revisionId: revisionRow.public_id,
          version: revisionRow.version,
        };
      });
    },

    async createRevision(publicId, ownershipSecret, documentPublicId, text) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        const document = await client.query<{
          id: string;
          current_revision_id: string;
          version: number;
        }>(
          `select d.id, d.current_revision_id, r.version
           from basirah.document d
           join basirah.document_revision r on r.id = d.current_revision_id
           where d.public_id = $1
           for update of d`,
          [documentPublicId],
        );
        const row = document.rows[0];
        if (!row) return null;
        if (row.version >= 20) throw new ResourceLimitError('revisions');
        const revision = await client.query<{ public_id: string; version: number; id: string }>(
          `insert into basirah.document_revision
             (document_id, parent_revision_id, version, original_text, content_hash)
           values ($1, $2, $3, $4, $5)
           returning id, public_id, version`,
          [row.id, row.current_revision_id, row.version + 1, text, digest(text)],
        );
        const revisionRow = revision.rows[0];
        if (!revisionRow) throw new Error('REVISION_CREATION_FAILED');
        await client.query('update basirah.document set current_revision_id = $1 where id = $2', [
          revisionRow.id,
          row.id,
        ]);
        return {
          documentId: documentPublicId,
          revisionId: revisionRow.public_id,
          version: revisionRow.version,
        };
      });
    },

    async getRevision(publicId, ownershipSecret, revisionPublicId) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        const result = await client.query<{
          revision_id: string;
          document_id: string;
          version: number;
          original_text: string;
        }>(
          `select r.public_id as revision_id, d.public_id as document_id,
                  r.version, r.original_text
           from basirah.document_revision r
           join basirah.document d on d.id = r.document_id
           where r.public_id = $1::uuid`,
          [revisionPublicId],
        );
        const row = result.rows[0];
        return row
          ? {
              revisionId: row.revision_id,
              documentId: row.document_id,
              version: row.version,
              text: row.original_text,
            }
          : null;
      });
    },

    async createReviewRun(
      publicId,
      ownershipSecret,
      revisionPublicId,
      idempotencyKey,
      deadlineSeconds,
      corpusVersion,
    ) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        const revision = await client.query<{ id: string }>(
          'select id from basirah.document_revision where public_id = $1::uuid',
          [revisionPublicId],
        );
        const revisionId = revision.rows[0]?.id;
        if (!revisionId) return null;

        const existing = await client.query<ReviewRunRow>(
          `select rr.public_id, dr.public_id as revision_public_id, rr.status, rr.attempt,
                  rr.corpus_version, rr.created_at, rr.deadline_at, rr.completed_at
           from basirah.review_run rr
           join basirah.document_revision dr on dr.id = rr.revision_id
           where rr.revision_id = $1 and rr.idempotency_key = $2::uuid`,
          [revisionId, idempotencyKey],
        );
        const existingRow = existing.rows[0];
        if (existingRow) return { ...reviewRun(existingRow), replayed: true };

        const runCount = await client.query<{ count: number }>(
          'select count(*)::int as count from basirah.review_run where revision_id = $1',
          [revisionId],
        );
        if ((runCount.rows[0]?.count ?? 0) >= 10) throw new ResourceLimitError('reviews');

        const inserted = await client.query<ReviewRunRow & { id: string }>(
          `insert into basirah.review_run
             (revision_id, idempotency_key, status, deadline_at, corpus_version)
           values ($1, $2::uuid, 'queued', clock_timestamp() + ($3 * interval '1 second'), $4)
           on conflict (revision_id, idempotency_key) do nothing
           returning id, public_id, $5::uuid as revision_public_id, status, attempt,
                     corpus_version, created_at, deadline_at, completed_at`,
          [revisionId, idempotencyKey, deadlineSeconds, corpusVersion, revisionPublicId],
        );
        const row = inserted.rows[0];
        if (row) {
          await client.query(
            `insert into basirah.review_run_event (run_id, sequence, event_type, safe_metadata)
             values ($1, 0, 'queued', jsonb_build_object('attempt', 1))`,
            [row.id],
          );
          return { ...reviewRun(row), replayed: false };
        }
        const raced = await client.query<ReviewRunRow>(
          `select rr.public_id, dr.public_id as revision_public_id, rr.status, rr.attempt,
                  rr.corpus_version, rr.created_at, rr.deadline_at, rr.completed_at
           from basirah.review_run rr
           join basirah.document_revision dr on dr.id = rr.revision_id
           where rr.revision_id = $1 and rr.idempotency_key = $2::uuid`,
          [revisionId, idempotencyKey],
        );
        const racedRow = raced.rows[0];
        if (!racedRow) throw new Error('REVIEW_CREATION_FAILED');
        return { ...reviewRun(racedRow), replayed: true };
      });
    },

    async getReviewRun(publicId, ownershipSecret, reviewPublicId) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        await client.query(
          `with expired as (
             update basirah.review_run
             set status = 'interrupted',
                 started_at = coalesce(started_at, clock_timestamp()),
                 completed_at = clock_timestamp()
             where public_id = $1::uuid
               and status in ('queued', 'retrieving', 'checking', 'assessing', 'validating')
               and deadline_at <= clock_timestamp()
             returning id
           )
           insert into basirah.review_run_event (run_id, sequence, event_type, safe_metadata)
           select id,
                  coalesce((select max(sequence) + 1 from basirah.review_run_event where run_id = expired.id), 0),
                  'interrupted', jsonb_build_object('reason', 'deadline_exceeded')
           from expired`,
          [reviewPublicId],
        );
        const result = await client.query<ReviewRunRow>(
          `select rr.public_id, dr.public_id as revision_public_id, rr.status, rr.attempt,
                  rr.corpus_version, rr.created_at, rr.deadline_at, rr.completed_at
           from basirah.review_run rr
           join basirah.document_revision dr on dr.id = rr.revision_id
           where rr.public_id = $1::uuid`,
          [reviewPublicId],
        );
        const row = result.rows[0];
        return row ? reviewRun(row) : null;
      });
    },

    async cancelReviewRun(publicId, ownershipSecret, reviewPublicId) {
      return withSerializable(async (client) => {
        await authenticate(client, publicId, ownershipSecret);
        const cancelled = await client.query<ReviewRunRow & { id: string }>(
          `update basirah.review_run rr
           set status = 'cancelled',
               started_at = coalesce(rr.started_at, clock_timestamp()),
               completed_at = clock_timestamp()
           from basirah.document_revision dr
           where rr.public_id = $1::uuid
             and dr.id = rr.revision_id
             and rr.status in ('queued', 'retrieving', 'checking', 'assessing', 'validating')
           returning rr.id, rr.public_id, dr.public_id as revision_public_id, rr.status,
                     rr.attempt, rr.corpus_version, rr.created_at, rr.deadline_at, rr.completed_at`,
          [reviewPublicId],
        );
        const row = cancelled.rows[0];
        if (row) {
          await client.query(
            `insert into basirah.review_run_event (run_id, sequence, event_type, safe_metadata)
             values ($1,
                     coalesce((select max(sequence) + 1 from basirah.review_run_event where run_id = $1), 0),
                     'cancelled', '{}'::jsonb)`,
            [row.id],
          );
          return reviewRun(row);
        }
        const result = await client.query<ReviewRunRow>(
          `select rr.public_id, dr.public_id as revision_public_id, rr.status, rr.attempt,
                  rr.corpus_version, rr.created_at, rr.deadline_at, rr.completed_at
           from basirah.review_run rr
           join basirah.document_revision dr on dr.id = rr.revision_id
           where rr.public_id = $1::uuid`,
          [reviewPublicId],
        );
        const existing = result.rows[0];
        return existing ? reviewRun(existing) : null;
      });
    },

    async close() {
      await pool.end();
    },
  };
}
