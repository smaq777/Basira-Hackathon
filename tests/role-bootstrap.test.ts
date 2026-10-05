import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { migrationChecksums } from '../scripts/migration-checksum.mjs';
import {
  bootstrapRoles,
  historicalCorpusChecksum,
  roleBootstrapMode,
  validateBootstrapRoles,
  executeCopiedRoleBootstrap,
} from '../scripts/role-bootstrap.mjs';

const attributes = {
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolcanlogin: false,
  rolreplication: false,
  rolbypassrls: false,
};
const roles = bootstrapRoles.map((rolname, i) => ({ oid: i + 1, rolname, ...attributes }));
const researchRole = roles[2]!;
const original = migrationChecksums(
  readFileSync('migrations/0008_typed_source_corpus.sql', 'utf8'),
);
const migration = {
  version: '0008_typed_source_corpus',
  checksum: original.canonicalChecksum,
  sql: original.canonicalSql.replace(
    '0000000000000000000000000000000000000000000000000000000000000000',
    original.canonicalChecksum,
  ),
};
function client(error?: { code: string }, unsafe = false) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith('create role')) {
        if (error) throw error;
      }
      if (sql.includes('from pg_catalog.pg_roles'))
        return { rows: unsafe ? [{ ...researchRole, rolsuper: true }] : roles };
      return { rows: [] };
    }),
  };
}
describe('explicit copied-role bootstrap', () => {
  it('defaults to strict and rejects unknown profiles', () => {
    expect(roleBootstrapMode(undefined)).toBe('strict');
    expect(roleBootstrapMode('existing-roles-v1')).toBe('existing-roles-v1');
    expect(() => roleBootstrapMode('automatic')).toThrow('MIGRATION_ROLE_BOOTSTRAP');
  });
  it('pins historical LF bytes and retains CRLF equivalence', () => {
    expect(original.canonicalChecksum).toBe(historicalCorpusChecksum);
    expect(migrationChecksums(original.canonicalSql.replace(/\n/g, '\r\n')).canonicalChecksum).toBe(
      historicalCorpusChecksum,
    );
  });
  it.each(Object.keys(attributes))('rejects unsafe %s without changing roles', (attribute) => {
    expect(() => validateBootstrapRoles([{ ...researchRole, [attribute]: true }], [])).toThrow(
      'INCOMPATIBLE',
    );
  });
  it('preserves incoming login memberships but rejects group membership outward', () => {
    expect(() => validateBootstrapRoles(roles, [{ member: 900 }])).not.toThrow();
    expect(() => validateBootstrapRoles(roles, [{ member: researchRole.oid }])).toThrow(
      'INCOMPATIBLE',
    );
  });
  it.each([undefined, { code: '42710' }])(
    'creates or reuses the exact role and commits the side receipt atomically',
    async (error) => {
      const db = client(error);
      const result = await executeCopiedRoleBootstrap(db, migration);
      expect(result.roleAction).toBe(error ? 'reused' : 'created');
      const calls = db.query.mock.calls.map(([sql]) => sql);
      expect(calls.at(-1)).toBe('commit');
      expect(calls.some((sql) => sql.includes('migration_execution_receipt'))).toBe(true);
      expect(calls.join('\n')).not.toMatch(/alter role|drop role|grant\s+\w+\s+to/iu);
      expect(calls[0]).toBe(migration.sql.split('create role basirah_research_runtime')[0]);
    },
  );
  it('retains non-duplicate failures and rolls back rather than skipping', async () => {
    const db = client({ code: '42501' });
    await expect(executeCopiedRoleBootstrap(db, migration)).rejects.toMatchObject({
      code: '42501',
    });
    expect(db.query.mock.calls.at(-1)?.[0]).toBe('rollback');
  });
  it('rolls back an incompatible existing role and all pending schema changes', async () => {
    const db = client({ code: '42710' }, true);
    await expect(executeCopiedRoleBootstrap(db, migration)).rejects.toThrow('INCOMPATIBLE');
    expect(db.query.mock.calls.at(-1)?.[0]).toBe('rollback');
    expect(db.query.mock.calls.some(([sql]) => sql === 'commit')).toBe(false);
  });
  it('does no SQL for modified historical source or wrong version', async () => {
    const db = client();
    await expect(
      executeCopiedRoleBootstrap(db, { ...migration, checksum: 'a'.repeat(64) }),
    ).rejects.toThrow('SOURCE_CHANGED');
    await expect(executeCopiedRoleBootstrap(db, { ...migration, version: '0009' })).rejects.toThrow(
      'SOURCE_CHANGED',
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});
