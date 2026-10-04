import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { databaseTls } from '../apps/api/src/database.js';

const migration = readFileSync('migrations/0001_basirah_core.sql', 'utf8');
const runtimeCryptoMigration = readFileSync(
  'migrations/0002_runtime_crypto_qualification.sql',
  'utf8',
);
const runtimeHmacMigration = readFileSync('migrations/0003_runtime_hmac_binary_input.sql', 'utf8');
const runtimeSchemaMigration = readFileSync(
  'migrations/0004_runtime_private_schema_usage.sql',
  'utf8',
);
const expiredGuestCleanupMigration = readFileSync(
  'migrations/0005_expired_guest_cleanup.sql',
  'utf8',
);
const tables = [
  'guest_session',
  'document',
  'document_revision',
  'claim',
  'source_edition',
  'passage',
  'passage_embedding',
  'review_run',
  'review_run_event',
  'evidence_item',
  'finding',
  'finding_evidence',
  'review_packet',
];

describe('database migration policy', () => {
  it.each(tables)('creates and protects %s', (table) => {
    expect(migration).toContain(`create table basirah.${table}`);
    expect(migration).toContain(`alter table basirah.${table} enable row level security`);
  });

  it('creates a non-login, non-bypass runtime role', () => {
    expect(migration).toContain(
      'create role basirah_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',
    );
    expect(migration).not.toMatch(/create role basirah_runtime login/iu);
  });

  it('uses signed session context rather than a forgeable identifier alone', () => {
    expect(migration).toContain("current_setting('basirah.session_proof', true)");
    expect(migration).toContain("hmac(candidate, signing_key, 'sha256')");
  });

  it('contains the documented retrieval and lifecycle indexes', () => {
    for (const index of [
      'guest_session_expiry_idx',
      'document_session_created_idx',
      'claim_revision_ordinal_uidx',
      'source_edition_active_idx',
      'passage_search_key_trgm_idx',
      'passage_embedding_compatible_space_idx',
      'review_run_active_lease_idx',
      'evidence_item_run_rank_idx',
      'finding_evidence_evidence_idx',
      'review_packet_expiry_idx',
    ])
      expect(migration).toContain(`index ${index}`);
  });

  it('keeps the small corpus on exact vector scan', () => {
    expect(migration).not.toMatch(/using\s+(?:hnsw|ivfflat)/iu);
  });

  it('contains no connection URL or embedded password', () => {
    expect(migration).not.toMatch(/postgres(?:ql)?:\/\//iu);
    expect(migration).not.toMatch(/password\s+['"]/iu);
  });

  it('has a stable checksum-sized digest', () => {
    expect(createHash('sha256').update(migration).digest('hex')).toHaveLength(64);
  });
});

describe('database TLS policy', () => {
  it('verifies the server certificate by default', () => {
    expect(databaseTls(undefined)).toEqual({ rejectUnauthorized: true });
    expect(databaseTls('verify-full')).toEqual({ rejectUnauthorized: true });
  });

  it('allows explicit encrypted provider TLS without public-chain verification', () => {
    expect(databaseTls('require')).toEqual({ rejectUnauthorized: false });
  });

  it('requires an explicit valid mode', () => {
    expect(databaseTls('disable')).toBe(false);
    expect(() => databaseTls('unexpected')).toThrow('DATABASE_TLS_MODE');
  });
});

describe('database-backed guest quotas', () => {
  const databaseSource = readFileSync('apps/api/src/database.ts', 'utf8');

  it('bounds documents, revisions and review runs independently', () => {
    expect(databaseSource).toContain("ResourceLimitError('documents')");
    expect(databaseSource).toContain("ResourceLimitError('revisions')");
    expect(databaseSource).toContain("ResourceLimitError('reviews')");
  });

  it('replays an existing idempotency key before enforcing the review cap', () => {
    expect(databaseSource.indexOf('if (existingRow) return')).toBeLessThan(
      databaseSource.indexOf("ResourceLimitError('reviews')"),
    );
  });
});

describe('runtime crypto qualification migration', () => {
  it.each(['gen_random_bytes', 'digest', 'hmac'])(
    'qualifies %s under the empty search path',
    (name) => {
      expect(runtimeCryptoMigration).toContain(`public.${name}`);
    },
  );

  it('records a forward-only migration version', () => {
    expect(runtimeCryptoMigration).toContain("'0002_runtime_crypto_qualification'");
    expect(runtimeCryptoMigration).not.toContain('drop schema');
  });
});

describe('runtime HMAC input migration', () => {
  it('uses the bytea HMAC signature explicitly', () => {
    expect(runtimeHmacMigration).toContain('public.hmac(pg_catalog.convert_to');
    expect(runtimeHmacMigration).toContain("'0003_runtime_hmac_binary_input'");
  });
});

describe('runtime private schema access migration', () => {
  it('grants schema resolution without granting private-table access', () => {
    expect(runtimeSchemaMigration).toContain(
      'grant usage on schema basirah_private to basirah_runtime',
    );
    expect(runtimeSchemaMigration).not.toMatch(
      /grant\s+(?:select|insert|update|delete).*basirah_private/iu,
    );
    expect(runtimeSchemaMigration).toContain("'0004_runtime_private_schema_usage'");
  });
});

describe('expired guest cleanup migration', () => {
  it('deletes only expired sessions in bounded, locked batches', () => {
    expect(expiredGuestCleanupMigration).toContain(
      'create function basirah_api.purge_expired_guest_sessions',
    );
    expect(expiredGuestCleanupMigration).toContain('where expires_at <= clock_timestamp()');
    expect(expiredGuestCleanupMigration).toContain('for update skip locked');
    expect(expiredGuestCleanupMigration).toContain('limit batch_size');
    expect(expiredGuestCleanupMigration).toContain("'0005_expired_guest_cleanup'");
  });

  it('exposes only the bounded cleanup function to the runtime role', () => {
    expect(expiredGuestCleanupMigration).toContain(
      'grant execute on function basirah_api.purge_expired_guest_sessions(integer) to basirah_runtime',
    );
    expect(expiredGuestCleanupMigration).not.toMatch(/grant\s+delete\s+on/iu);
  });
});
