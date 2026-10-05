export function migrationChecksums(sql: string): {
  canonicalSql: string;
  canonicalChecksum: string;
  matchesRecorded(recorded: string): boolean;
};
