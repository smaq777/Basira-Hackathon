import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SourceEvidenceSchema } from '../../../packages/contracts/src/foundation.js';
import { normalizeCorpusSearch } from './hosted-corpus.js';
import { canonical } from './foundation.js';

export const SourceCorpusManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    corpusVersion: z.string().min(1).max(120),
    sources: z
      .array(
        SourceEvidenceSchema.extend({
          sourceId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/u),
          reference: z.string().min(1).max(300),
          rightsRecord: z.string().min(1).max(2000),
          searchViews: z.array(z.string().min(1).max(30000)).max(10).optional(),
        }),
      )
      .min(1)
      .max(10000),
    embeddingSpace: z
      .object({
        modelId: z.string().min(1).max(200),
        dimensions: z.number().int().min(1).max(4096),
        taskType: z.literal('search_document'),
      })
      .strict()
      .optional(),
    embeddings: z
      .array(
        z
          .object({
            snapshotKey: z.string().min(1).max(160),
            originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            embedding: z.array(z.number().finite()).min(1).max(4096),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = new Set<string>();
    for (const row of manifest.sources) {
      if (keys.has(row.snapshotKey))
        context.addIssue({ code: 'custom', message: 'DUPLICATE_SNAPSHOT_KEY' });
      keys.add(row.snapshotKey);
      if (row.approvalStatus !== 'pending' || !row.researchOnly)
        context.addIssue({ code: 'custom', message: 'INGESTION_REQUIRES_PENDING_RESEARCH_SOURCE' });
      if (
        createHash('sha256').update(row.originalText, 'utf8').digest('hex') !== row.originalSha256
      )
        context.addIssue({ code: 'custom', message: 'SOURCE_HASH_MISMATCH' });
      for (const footnote of row.footnotes ?? [])
        if (
          createHash('sha256').update(footnote.originalText, 'utf8').digest('hex') !==
          footnote.originalSha256
        )
          context.addIssue({ code: 'custom', message: 'FOOTNOTE_HASH_MISMATCH' });
    }
    const vectorKeys = new Set<string>();
    for (const row of manifest.embeddings ?? []) {
      const source = manifest.sources.find((source) => source.snapshotKey === row.snapshotKey);
      if (
        !source ||
        row.originalSha256 !== source.originalSha256 ||
        vectorKeys.has(row.snapshotKey) ||
        row.embedding.length !== manifest.embeddingSpace?.dimensions
      )
        context.addIssue({ code: 'custom', message: 'EMBEDDING_BINDING_MISMATCH' });
      vectorKeys.add(row.snapshotKey);
    }
  });
export type SourceCorpusManifest = z.infer<typeof SourceCorpusManifestSchema>;

type CorpusRelation = {
  targetSnapshotKey: string;
  relationType: string;
  provenance: Record<string, unknown>;
};
export function assertFrozenCorpusRelations(
  saved: CorpusRelation[],
  proposed: CorpusRelation[],
): void {
  const ordered = (rows: CorpusRelation[]) =>
    [...rows].sort(
      (a, b) =>
        a.targetSnapshotKey.localeCompare(b.targetSnapshotKey) ||
        a.relationType.localeCompare(b.relationType),
    );
  if (canonical(ordered(saved)) !== canonical(ordered(proposed)))
    throw new Error('RELATION_IDENTITY_COLLISION');
}

/** Administrative isolated-branch ingestion; source approval is a separate reviewed operation. */
export async function ingestSourceCorpus(
  client: PoolClient,
  input: unknown,
): Promise<{ passages: number; embeddings: number; relations: number }> {
  const manifest = SourceCorpusManifestSchema.parse(input);
  await client.query('begin');
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('basirah:source-corpus-ingestion'))");
    const ids = new Map<string, string>();
    const newSnapshots = new Set<string>();
    for (let ordinal = 0; ordinal < manifest.sources.length; ordinal++) {
      const row = manifest.sources[ordinal]!;
      const editionValues = [
        row.sourceId,
        row.work,
        row.author ?? 'Not recorded',
        row.edition ?? 'Not recorded',
        row.sourceVersion,
        row.sourceUrl,
        row.rightsRecord,
      ];
      await client.query(
        `insert into basirah.source_edition(source_key,work_name,author_name,edition,content_version,source_url,rights_record,approval_status)
        values($1,$2,$3,$4,$5,$6,$7,'pending') on conflict(source_key,content_version) do nothing`,
        editionValues,
      );
      const edition = (
        await client.query(
          `select id::text,work_name,author_name,edition,source_url,rights_record from basirah.source_edition where source_key=$1 and content_version=$2`,
          [row.sourceId, row.sourceVersion],
        )
      ).rows[0];
      if (
        !edition ||
        JSON.stringify([
          edition.work_name,
          edition.author_name,
          edition.edition,
          edition.source_url,
          edition.rights_record,
        ]) !== JSON.stringify(editionValues.slice(1, 4).concat(editionValues.slice(5)))
      )
        throw new Error('SOURCE_EDITION_IDENTITY_COLLISION');
      const searchKey = normalizeCorpusSearch(
        [row.originalText, ...(row.searchViews ?? [])].join(' '),
      );
      const params = [
        edition.id,
        row.reference,
        ordinal,
        row.originalText,
        searchKey,
        row.originalSha256,
        row.sourceRole,
        row.snapshotKey,
        manifest.corpusVersion,
        JSON.stringify(row.provenance),
        row.contextBefore ?? null,
        row.contextAfter ?? null,
        JSON.stringify(row.footnotes ?? []),
      ];
      const inserted = await client.query(
        `insert into basirah.passage(source_edition_id,stable_reference,ordinal,original_text,search_key,content_hash,source_role,snapshot_key,corpus_version,provenance,context_before,context_after,footnotes)
        values($1,$2,$3,$4,$5,decode($6,'hex'),$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb)
        on conflict(source_edition_id,stable_reference) do nothing returning id`,
        params,
      );
      const saved = (
        await client.query(
          `select id::text,snapshot_key,source_role,corpus_version,original_text,search_key,encode(content_hash,'hex') hash,provenance,context_before,context_after,footnotes from basirah.passage where source_edition_id=$1 and stable_reference=$2`,
          [edition.id, row.reference],
        )
      ).rows[0];
      if (
        !saved ||
        saved.snapshot_key !== row.snapshotKey ||
        saved.source_role !== row.sourceRole ||
        saved.hash !== row.originalSha256 ||
        saved.original_text !== row.originalText ||
        saved.search_key !== searchKey ||
        canonical(saved.provenance) !== canonical(row.provenance) ||
        saved.context_before !== (row.contextBefore ?? null) ||
        saved.context_after !== (row.contextAfter ?? null) ||
        canonical(saved.footnotes) !== canonical(row.footnotes ?? [])
      )
        throw new Error('PASSAGE_IDENTITY_COLLISION');
      await client.query(
        'insert into basirah.corpus_snapshot(corpus_version,passage_id) values($1,$2) on conflict do nothing',
        [manifest.corpusVersion, saved.id],
      );
      ids.set(row.snapshotKey, saved.id);
      if (inserted.rows.length) newSnapshots.add(row.snapshotKey);
    }
    const lookup = async (key: string): Promise<string> => {
      const local = ids.get(key);
      if (local) return local;
      const saved = (
        await client.query(
          'select id::text from basirah.passage where snapshot_key=$1 and exists(select 1 from basirah.corpus_snapshot membership where membership.passage_id=basirah.passage.id and membership.corpus_version=$2)',
          [key, manifest.corpusVersion],
        )
      ).rows[0];
      if (!saved) throw new Error('UNRESOLVED_CORPUS_RELATION');
      return saved.id;
    };
    let relations = 0;
    for (const row of manifest.sources) {
      const links = [...(row.relations ?? [])];
      if (row.parentSnapshotKey)
        links.push({
          targetSnapshotKey: row.parentSnapshotKey,
          relationType:
            row.sourceRole === 'tafsir_footnote'
              ? ('footnote_of' as const)
              : ('comments_on' as const),
          provenance: { source: 'explicit_parent_snapshot' },
        });
      if (!newSnapshots.has(row.snapshotKey)) {
        const savedLinks = (
          await client.query(
            `select target.snapshot_key as "targetSnapshotKey",relation.relation_type as "relationType",relation.provenance
          from basirah.passage_relation relation join basirah.passage target on target.id=relation.to_passage_id
          where relation.from_passage_id=$1`,
            [ids.get(row.snapshotKey)],
          )
        ).rows;
        assertFrozenCorpusRelations(savedLinks, links);
      }
      for (const link of links) {
        const from = await lookup(row.snapshotKey),
          to = await lookup(link.targetSnapshotKey);
        await client.query(
          `insert into basirah.passage_relation(from_passage_id,to_passage_id,relation_type,provenance) values($1,$2,$3,$4::jsonb) on conflict do nothing`,
          [from, to, link.relationType, JSON.stringify(link.provenance)],
        );
        const saved = (
          await client.query(
            `select provenance from basirah.passage_relation where from_passage_id=$1 and to_passage_id=$2 and relation_type=$3`,
            [from, to, link.relationType],
          )
        ).rows[0];
        if (canonical(saved.provenance) !== canonical(link.provenance))
          throw new Error('RELATION_IDENTITY_COLLISION');
        relations++;
      }
    }
    for (const row of manifest.embeddings ?? []) {
      const space = manifest.embeddingSpace!;
      const passageId = await lookup(row.snapshotKey);
      await client.query(
        `insert into basirah.passage_embedding(passage_id,model_id,dimensions,task_type,corpus_version,embedding)
        values($1,$2,$3,$4,$5,$6::public.vector) on conflict(passage_id,model_id,task_type,corpus_version) do nothing`,
        [
          passageId,
          space.modelId,
          space.dimensions,
          space.taskType,
          manifest.corpusVersion,
          JSON.stringify(row.embedding),
        ],
      );
      const saved = (
        await client.query(
          `select dimensions,embedding::text from basirah.passage_embedding where passage_id=$1 and model_id=$2 and task_type=$3 and corpus_version=$4`,
          [passageId, space.modelId, space.taskType, manifest.corpusVersion],
        )
      ).rows[0];
      const actual = JSON.parse(saved.embedding) as number[];
      if (
        saved.dimensions !== space.dimensions ||
        actual.some(
          (value, index) =>
            Math.abs(value - row.embedding[index]!) >
            Math.max(1e-7, Math.abs(row.embedding[index]!) * 1e-6),
        )
      )
        throw new Error('EMBEDDING_IDENTITY_COLLISION');
    }
    await client.query('commit');
    return {
      passages: manifest.sources.length,
      embeddings: manifest.embeddings?.length ?? 0,
      relations,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
