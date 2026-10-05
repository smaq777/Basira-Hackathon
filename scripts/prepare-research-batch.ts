import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sha256 } from '../apps/api/src/foundation.js';
import { ResearchTopicSchema } from '../apps/api/src/research-page-cache.js';
import { SourceCorpusManifestSchema } from '../apps/api/src/source-corpus-ingestion.js';
import { verifyResearchOriginalRecord } from '../apps/api/src/research-original-record.js';

const [foundationRoot, baselinePath, planPath, outputPath] = process.argv.slice(2);
if (!foundationRoot || !baselinePath || !planPath || !outputPath || process.argv.length !== 6)
  throw new Error(
    'Usage: tsx scripts/prepare-research-batch.ts <foundation-root> <baseline.json> <plan.json> <new-staging.json>',
  );
const baseline = SourceCorpusManifestSchema.parse(JSON.parse(readFileSync(baselinePath, 'utf8')));
const plan = z
  .array(
    z
      .object({ reference: z.string().regex(/^\d{1,3}:\d{1,3}$/u), seedTopic: ResearchTopicSchema })
      .strict(),
  )
  .min(1)
  .max(20)
  .parse(JSON.parse(readFileSync(planPath, 'utf8')));
if (new Set(plan.map((row) => row.reference)).size !== plan.length)
  throw new Error('PLAN_DUPLICATE_REFERENCE');
const db = new DatabaseSync(resolve(foundationRoot, 'data/derived/evidence-tanzil.sqlite'), {
  readOnly: true,
});
type Row = {
  id: string;
  role: string;
  reference: string;
  surah: number;
  ayah: number;
  original_text: string;
  text_sha256: string;
  metadata_json: string;
  search_original: string;
};
const query = db.prepare('select * from records where id = ?');
const fileHashes = new Map<string, string>();
function verified(id: string): Row {
  const row = query.get(id) as Row | undefined;
  if (!row || sha256(row.original_text) !== row.text_sha256)
    throw new Error('SQLITE_ORIGINAL_HASH_MISMATCH');
  const metadata = JSON.parse(row.metadata_json);
  const origin = metadata.input_provenance;
  const path = resolve(foundationRoot!, origin.raw_file);
  const root = resolve(foundationRoot!);
  if (!path.startsWith(root + '/') && !path.startsWith(root + '\\'))
    throw new Error('RAW_FILE_OUTSIDE_FOUNDATION');
  let hash = fileHashes.get(path);
  if (!hash) {
    hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    fileHashes.set(path, hash);
  }
  const reference = id
    .replace(/^tanzil-uthmani-v1\.1:|^kfgqpc-muyassar-v3:/u, '')
    .replace(/:tafsir$/u, '');
  verifyResearchOriginalRecord(row, id, reference, hash);
  return row;
}
try {
  const additions = plan.flatMap(({ reference, seedTopic }) =>
    ['quran_text', 'tafsir_commentary'].map((role) => {
      const prefix = role === 'quran_text' ? 'tanzil-uthmani-v1.1:' : 'kfgqpc-muyassar-v3:';
      const suffix = role === 'quran_text' ? '' : ':tafsir';
      const row = verified(prefix + reference + suffix);
      const metadata = JSON.parse(row.metadata_json);
      const template = baseline.sources.find(
        (old) =>
          old.provenance.source_id === metadata.source_id &&
          old.sourceRole === role &&
          old.sourceVersion === metadata.source_version,
      );
      if (!template) throw new Error('PILOT_EDITION_NOT_IN_BASELINE');
      const neighbor = (delta: number) => {
        const id = `${prefix}${row.surah}:${row.ayah + delta}${suffix}`;
        return query.get(id) ? verified(id) : null;
      };
      const before = neighbor(-1),
        after = neighbor(1);
      const contextMetadata = [before, after].flatMap((context, index) =>
        context
          ? [
              {
                direction: index === 0 ? 'before' : 'after',
                snapshotKey: context.id,
                reference: context.reference,
                originalSha256: context.text_sha256,
                sourceVersion: JSON.parse(context.metadata_json).source_version,
              },
            ]
          : [],
      );
      const source = {
        snapshotKey: row.id,
        sourceId: template.sourceId,
        sourceVersion: metadata.source_version,
        sourceRole: role,
        reference,
        originalText: row.original_text,
        originalSha256: row.text_sha256,
        work: template.work,
        author: template.author,
        edition: template.edition,
        sourceUrl: template.sourceUrl,
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: role === 'tafsir_commentary' ? `tanzil-uthmani-v1.1:${reference}` : null,
        delivery: 'snapshot',
        retrievalModes: ['exact', 'lexical'],
        rightsRecord: template.rightsRecord,
        contextBefore: before?.original_text ?? null,
        contextAfter: after?.original_text ?? null,
        // This frozen pilot indexes Quran originals only. Publisher auxiliary
        // representations remain attributed in metadata, without expanding its index.
        searchViews: role === 'quran_text' ? [] : [row.search_original],
        provenance: {
          ...metadata,
          originalSourceId: metadata.source_id,
          acquisition: 'read-only attributed Foundation SQLite original; raw file hash verified',
          neighborContext: contextMetadata,
        },
      };
      return {
        source,
        originalRecord: {
          id: row.id,
          reference,
          sourceVersion: metadata.source_version,
          sourceRole: role,
          originalText: row.original_text,
          originalSha256: row.text_sha256,
        },
        seedTopic,
      };
    }),
  );
  writeFileSync(outputPath, JSON.stringify({ baseline, additions }, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      stagedOriginals: additions.length,
      verifiedRawFiles: fileHashes.size,
      longestOriginalUtf16: Math.max(...additions.map((item) => item.source.originalText.length)),
    }),
  );
} finally {
  db.close();
}
