import { createHash } from 'node:crypto';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Preserve SQL byte content except deterministic CRLF/LF checkout conversion. */
export function migrationChecksums(sql) {
  const canonicalSql = sql.replace(/\r\n/gu, '\n');
  const canonicalChecksum = sha256(canonicalSql);
  const crlfChecksum = sha256(canonicalSql.replace(/\n/gu, '\r\n'));
  return {
    canonicalSql,
    canonicalChecksum,
    matchesRecorded: (recorded) => recorded === canonicalChecksum || recorded === crlfChecksum,
  };
}
