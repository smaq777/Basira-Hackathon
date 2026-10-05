import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { migrationChecksums } from './migration-checksum.mjs';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is required');

const migrationsDirectory = resolve('migrations');
const files = (await readdir(migrationsDirectory))
  .filter((file) => /^\d+_[a-z0-9_]+\.sql$/u.test(file))
  .sort();
if (files.length === 0) throw new Error('No migrations found');

const url = new URL(connectionString);
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');
const tlsMode = process.env.DATABASE_TLS_MODE?.trim() || 'verify-full';
if (!['verify-full', 'require', 'disable'].includes(tlsMode))
  throw new Error('DATABASE_TLS_MODE must be verify-full, require, or disable');
const client = new Client({
  connectionString: url.toString(),
  ssl:
    tlsMode === 'disable'
      ? false
      : {
          rejectUnauthorized: tlsMode === 'verify-full',
        },
  application_name: 'basirah-migrator',
});

await client.connect();
try {
  for (const file of files) {
    const version = file.replace(/\.sql$/u, '');
    const template = await readFile(resolve(migrationsDirectory, file), 'utf8');
    const {
      canonicalSql,
      canonicalChecksum: checksum,
      matchesRecorded,
    } = migrationChecksums(template);
    const table = await client.query(
      "select to_regclass('basirah_private.schema_migration') is not null as exists",
    );
    if (table.rows[0]?.exists) {
      const applied = await client.query(
        'select checksum_sha256 from basirah_private.schema_migration where version = $1',
        [version],
      );
      if (applied.rows[0]) {
        if (!matchesRecorded(applied.rows[0].checksum_sha256))
          throw new Error(`Applied migration checksum changed: ${version}`);
        console.log(`already applied ${version}`);
        continue;
      }
    }
    const sql = canonicalSql.replace(
      "'0000000000000000000000000000000000000000000000000000000000000000'",
      `'${checksum}'`,
    );
    await client.query(sql);
    console.log(`applied ${version}`);
  }
} finally {
  await client.end();
}
