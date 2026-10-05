import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import {
  ingestSourceCorpus,
  SourceCorpusManifestSchema,
} from '../apps/api/src/source-corpus-ingestion.js';

const path = process.argv[2];
if (!path)
  throw new Error(
    'Usage: npx tsx scripts/ingest-source-corpus.ts <external-manifest.json> [--validate-only]',
  );
const manifest = SourceCorpusManifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
if (process.argv.includes('--validate-only')) {
  console.log(
    JSON.stringify({
      valid: true,
      corpusVersion: manifest.corpusVersion,
      passages: manifest.sources.length,
      embeddings: manifest.embeddings?.length ?? 0,
    }),
  );
} else {
  if (process.env.SOURCE_CORPUS_ISOLATED_BRANCH_CONFIRMED !== 'true')
    throw new Error('Explicit isolated development branch confirmation is required');
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is required');
  const uri = new URL(connectionString);
  if (uri.hostname.includes('-pooler'))
    throw new Error('Administrative ingestion requires a direct connection');
  uri.searchParams.delete('sslmode');
  uri.searchParams.delete('channel_binding');
  const pool = new Pool({
    connectionString: uri.toString(),
    ssl: { rejectUnauthorized: true },
    application_name: 'basirah-research-corpus-ingestion',
  });
  const client = await pool.connect();
  try {
    console.log(
      JSON.stringify({
        corpusVersion: manifest.corpusVersion,
        ...(await ingestSourceCorpus(client, manifest)),
      }),
    );
  } finally {
    client.release();
    await pool.end();
  }
}
