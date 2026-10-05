import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrationChecksums } from '../scripts/migration-checksum.mjs';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const sql = 'begin;\ncreate extension if not exists vector;\ncommit;\n';
describe('portable migration checksums', () => {
  it('accepts only exact LF and CRLF versions and writes canonical LF', () => {
    const crlf = sql.replace(/\n/gu, '\r\n');
    for (const input of [sql, crlf]) {
      const check = migrationChecksums(input);
      expect(check.canonicalSql).toBe(sql);
      expect(check.canonicalChecksum).toBe(hash(sql));
      expect(check.matchesRecorded(hash(sql))).toBe(true);
      expect(check.matchesRecorded(hash(crlf))).toBe(true);
    }
  });
  it('rejects SQL modifications, including the deliberate local vector substitution', () => {
    const check = migrationChecksums(sql);
    for (const changed of [
      sql.replace('vector', 'pg_trgm'),
      sql.replace('vector', 'vector '),
      sql.trimEnd(),
      sql + '-- changed\n',
    ]) {
      expect(check.matchesRecorded(hash(changed))).toBe(false);
      expect(check.matchesRecorded(hash(changed.replace(/\n/gu, '\r\n')))).toBe(false);
    }
  });
  it('does not accept arbitrary mixed-ending historical hashes or bare-CR transformations', () => {
    const check = migrationChecksums(sql);
    expect(check.matchesRecorded(hash(sql.replace('begin;\n', 'begin;\r\n')))).toBe(false);
    expect(check.matchesRecorded(hash(sql.replace(/\n/gu, '\r')))).toBe(false);
  });
});
