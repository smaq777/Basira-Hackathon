import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { loadSourcePolicy } from '../apps/api/src/source-policy.js';
import { createResearchPagePassageIndex } from '../apps/api/src/research-page-passage-index.js';
import { createOpenRouterQueryEmbedding } from '../apps/api/src/query-embedding.js';
const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    receipt: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'allow-paid': { type: 'boolean', default: false },
    'max-embeddings': { type: 'string', default: '0' },
    'timeout-ms': { type: 'string', default: '120000' },
  },
  strict: true,
});
if (!values.manifest || !values.receipt) throw Error('MANIFEST_AND_NEW_RECEIPT_REQUIRED');
const manifest = z
  .object({
    schemaVersion: z.literal(1),
    policySha256: z.string().regex(/^[a-f0-9]{64}$/u),
    parents: z
      .array(
        z
          .object({
            snapshotKey: z.string().regex(/^web-cache:[a-f0-9]{64}$/u),
            originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            sourceUrl: z.string().url(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .parse(JSON.parse(await readFile(values.manifest, 'utf8')));
if (new Set(manifest.parents.map((p) => p.snapshotKey)).size !== manifest.parents.length)
  throw Error('DUPLICATE_PARENT');
const maxEmbeddings = Number(values['max-embeddings']),
  timeoutMs = Number(values['timeout-ms']);
if (
  !Number.isInteger(maxEmbeddings) ||
  maxEmbeddings < 0 ||
  maxEmbeddings > 256 ||
  !Number.isInteger(timeoutMs) ||
  timeoutMs < 1000 ||
  timeoutMs > 120000
)
  throw Error('BOUNDED_LIMITS_REQUIRED');
if (maxEmbeddings > 0 && (!values.apply || !values['allow-paid']))
  throw Error('EXPLICIT_PAID_APPLY_REQUIRED');
const policy = await loadSourcePolicy(process.env.FOUNDATION_WEB_POLICY_PATH || undefined);
if (policy.sha256 !== manifest.policySha256) throw Error('POLICY_MANIFEST_MISMATCH');
// Reserve the receipt before any connection or paid call; never overwrite prior evidence.
const receipt = await import('node:fs/promises').then((fs) => fs.open(values.receipt!, 'wx'));
try {
  const raw = process.env.DATABASE_URL_UNPOOLED;
  if (!raw) throw Error('DIRECT_ISOLATED_DATABASE_REQUIRED');
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  const mode = process.env.DATABASE_TLS_MODE || 'verify-full';
  if (!['verify-full', 'require', 'disable'].includes(mode))
    throw Error('DATABASE_TLS_MODE_INVALID');
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 2,
    ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'verify-full' },
    application_name: 'basirah-cache-passage-backfill',
  });
  try {
    const embed = maxEmbeddings
      ? createOpenRouterQueryEmbedding({
          apiKey: process.env.OPENROUTER_API_KEY || '',
          cacheSize: 0,
        })
      : undefined;
    const index = createResearchPagePassageIndex({
      readerPool: pool,
      writerPool: values.apply ? pool : undefined,
      policy,
      embed,
    });
    const keys = manifest.parents.map((p) => p.snapshotKey),
      plan = await index.plan(keys);
    if (
      plan.some(
        (p) =>
          p.originalSha256 !==
            manifest.parents.find((m) => m.snapshotKey === p.parentSnapshotKey)?.originalSha256 ||
          p.sourceUrl !==
            manifest.parents.find((m) => m.snapshotKey === p.parentSnapshotKey)?.sourceUrl,
      )
    )
      throw Error('PARENT_MANIFEST_MISMATCH');
    const result = values.apply ? await index.backfill(keys, { maxEmbeddings, timeoutMs }) : null;
    await receipt.writeFile(
      JSON.stringify(
        {
          schemaVersion: 1,
          mode: values.apply ? 'insert-only-backfill' : 'read-only-plan',
          manifest,
          plan,
          limits: { maxEmbeddings, timeoutMs },
          result,
          providerBilling: 'Recorded by the provider separately; failed-call billing is unknown.',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      JSON.stringify({
        mode: values.apply ? 'insert-only-backfill' : 'read-only-plan',
        parents: plan.length,
        receipt: values.receipt,
      }),
    );
  } finally {
    await pool.end();
  }
} catch {
  await receipt.writeFile(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'failed',
        mode: values.apply ? 'insert-only-backfill' : 'read-only-plan',
        errorCode: 'CACHE_PASSAGE_BACKFILL_FAILED',
        providerBilling: 'Unknown for any failed attempted calls.',
      },
      null,
      2,
    ) + '\n',
  );
  // Connection/provider exceptions can contain credentials; report only a fixed public code.
  process.exitCode = 1;
  console.error('CACHE_PASSAGE_BACKFILL_FAILED');
} finally {
  await receipt.close();
}
