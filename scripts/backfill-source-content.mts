import { readFile, open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { SourceEvidenceSchema } from '../packages/contracts/src/foundation.js';
import { SourceContentSelectionSchema } from '../packages/contracts/src/source-content.js';
import { loadSourcePolicy } from '../apps/api/src/source-policy.js';
import { sourceContentPassages } from '../apps/api/src/source-content-view.js';
import { createSourceContentStore } from '../apps/api/src/source-content-store.js';
import { cachePassageConnections } from './cache-passage-connections.js';
const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    receipt: { type: 'string' },
    apply: { type: 'boolean', default: false },
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
            sourceUrl: z.string().url().max(1000),
            selection: SourceContentSelectionSchema,
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .parse(JSON.parse(await readFile(values.manifest, 'utf8')));
if (new Set(manifest.parents.map((p) => p.snapshotKey)).size !== manifest.parents.length)
  throw Error('DUPLICATE_PARENT');
const timeoutMs = Number(values['timeout-ms']);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
  throw Error('BOUNDED_LIMIT_REQUIRED');
const policy = await loadSourcePolicy(process.env.FOUNDATION_WEB_POLICY_PATH || undefined);
if (policy.sha256 !== manifest.policySha256) throw Error('POLICY_MANIFEST_MISMATCH');
const receipt = await open(values.receipt, 'wx');
const report: {
  schemaVersion: number;
  status: string;
  mode: string;
  providerCalls: number;
  parents?: unknown;
  result?: unknown;
  errorCode?: string;
} = {
  schemaVersion: 1,
  status: 'pending',
  mode: values.apply ? 'insert-only-sidecars' : 'read-only-plan',
  providerCalls: 0,
};
try {
  const connections = cachePassageConnections(
    process.env.FOUNDATION_PASSAGE_READER_DATABASE_URL,
    process.env.FOUNDATION_PASSAGE_WRITER_DATABASE_URL,
    values.apply,
  );
  // This operator always verifies TLS. Branch isolation is the external frozen audit.
  const pool = (connectionString: string) =>
    new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: true },
      max: 2,
      connectionTimeoutMillis: 10000,
    });
  const reader = pool(connections.reader),
    writer = connections.writer ? pool(connections.writer) : undefined;
  try {
    const signal = AbortSignal.timeout(timeoutMs),
      c = await reader.connect();
    let sources;
    try {
      await c.query('begin read only');
      await c.query('set local role basirah_research_runtime');
      await c.query("set local statement_timeout='5000ms'");
      signal.throwIfAborted();
      sources = (
        await c.query(
          'select evidence from basirah.research_page_cache where snapshot_key=any($1::text[]) and policy_sha256=$2 and revoked_at is null and expires_at>clock_timestamp() order by snapshot_key',
          [manifest.parents.map((p) => p.snapshotKey), policy.sha256],
        )
      ).rows.map((r) => SourceEvidenceSchema.parse(r.evidence));
      signal.throwIfAborted();
      await c.query('commit');
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
    if (sources.length !== manifest.parents.length) throw Error('PARENT_MANIFEST_MISMATCH');
    const plan = sources.map((source) => {
      const declared = manifest.parents.find((p) => p.snapshotKey === source.snapshotKey)!;
      if (
        declared.originalSha256 !== source.originalSha256 ||
        declared.sourceUrl !== source.sourceUrl
      )
        throw Error('PARENT_MANIFEST_MISMATCH');
      const built = sourceContentPassages(source, declared.selection);
      return {
        source,
        selection: built.selection,
        summary: {
          snapshotKey: source.snapshotKey,
          originalSha256: source.originalSha256,
          sourceUrl: source.sourceUrl,
          contentCoverage: built.contentCoverage,
          coverage: built.coverage,
          passageIds: built.passages.map((p) => p.passageId),
        },
      };
    });
    report.parents = plan.map((p) => p.summary);
    if (values.apply) {
      const store = createSourceContentStore({ readerPool: reader, writerPool: writer, policy });
      const results = [];
      for (const p of plan) {
        signal.throwIfAborted();
        results.push(await store.store(p.source, p.selection, signal));
      }
      report.result = results;
    }
    report.status = 'passed';
  } finally {
    await Promise.all([reader.end(), writer?.end()]);
  }
} catch (e) {
  report.status = 'failed';
  report.errorCode =
    e instanceof Error && /^[A-Z_]+$/u.test(e.message)
      ? e.message
      : 'SOURCE_CONTENT_BACKFILL_FAILED';
  process.exitCode = 1;
} finally {
  await receipt.writeFile(JSON.stringify(report, null, 2) + '\n');
  await receipt.close();
}
console.log(JSON.stringify({ status: report.status, mode: report.mode, providerCalls: 0 }));
