import { z } from 'zod';
import { canonical, sha256 } from './foundation.js';
import { PageClassificationSchema, ResearchTopicSchema } from './research-page-cache.js';
import { SourceCorpusManifestSchema } from './source-corpus-ingestion.js';

export const RESEARCH_BATCH_COMPILER_VERSION = 'bounded-originals-v1';
const Source = SourceCorpusManifestSchema.shape.sources.element;
export const ResearchBatchInputSchema = z
  .object({
    baseline: SourceCorpusManifestSchema,
    additions: z
      .array(
        z
          .object({
            source: Source,
            originalRecord: z
              .object({
                id: z.string().min(1).max(160),
                reference: z
                  .string()
                  .regex(/^([1-9]\d{0,2}):([1-9]\d{0,2})$/u)
                  .refine((value) => {
                    const [surah, ayah] = value.split(':').map(Number);
                    return surah! <= 114 && ayah! <= 286;
                  }),
                sourceVersion: z.string().regex(/^[a-f0-9]{64}$/u),
                sourceRole: z.enum(['quran_text', 'tafsir_commentary']),
                originalText: z.string().min(1).max(30000),
                originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              })
              .strict(),
            seedTopic: ResearchTopicSchema,
            classification: PageClassificationSchema,
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

/** Compile complete, attributed source units. Topic proposals never imply source approval. */
export function compileResearchBatch(input: unknown) {
  const { baseline, additions } = ResearchBatchInputSchema.parse(input);
  const baselineKeys = new Set(baseline.sources.map((row) => row.snapshotKey));
  const unique = new Map<string, (typeof additions)[number]>();
  let repeatedInputs = 0;
  for (const item of additions) {
    const { source: row, originalRecord: record } = item;
    if (
      row.originalText !== record.originalText ||
      row.snapshotKey !== record.id ||
      row.originalSha256 !== record.originalSha256 ||
      sha256(record.originalText) !== record.originalSha256 ||
      row.reference !== record.reference ||
      row.sourceVersion !== record.sourceVersion ||
      row.sourceRole !== record.sourceRole ||
      row.approvalStatus !== 'pending' ||
      !row.researchOnly ||
      row.delivery !== 'snapshot'
    )
      throw new Error('BATCH_ORIGINAL_BINDING_MISMATCH');
    const expectedId =
      row.sourceRole === 'quran_text'
        ? `tanzil-uthmani-v1.1:${row.reference}`
        : `kfgqpc-muyassar-v3:${row.reference}:tafsir`;
    if (
      record.id !== expectedId ||
      row.provenance.source_version !== row.sourceVersion ||
      row.provenance.source_role !== row.sourceRole
    )
      throw new Error('BATCH_ORIGIN_NOT_IN_PILOT');
    if (baselineKeys.has(row.snapshotKey)) throw new Error('BATCH_SOURCE_ALREADY_IN_BASELINE');
    const originalSourceId =
      row.sourceRole === 'quran_text' ? 'tanzil-uthmani-v1.1' : 'kfgqpc-muyassar-v3';
    const edition = baseline.sources.find(
      (old) =>
        old.sourceId === row.sourceId &&
        old.sourceVersion === row.sourceVersion &&
        old.sourceRole === row.sourceRole &&
        old.provenance.source_id === originalSourceId,
    );
    if (
      !edition ||
      row.provenance.source_id !== originalSourceId ||
      canonical([
        edition.work,
        edition.author,
        edition.edition,
        edition.sourceUrl,
        edition.rightsRecord,
      ]) !== canonical([row.work, row.author, row.edition, row.sourceUrl, row.rightsRecord])
    )
      throw new Error('BATCH_EDITION_IDENTITY_MISMATCH');
    const existing = unique.get(row.snapshotKey);
    if (existing) {
      if (canonical(existing) !== canonical(item))
        throw new Error('BATCH_DUPLICATE_IDENTITY_MISMATCH');
      repeatedInputs++;
    } else unique.set(row.snapshotKey, item);
  }
  const ordered = [...unique.values()].sort((a, b) =>
    a.source.snapshotKey.localeCompare(b.source.snapshotKey, 'en'),
  );
  const all = new Map(
    [...baseline.sources, ...ordered.map((item) => item.source)].map((row) => [
      row.snapshotKey,
      row,
    ]),
  );
  for (const { source: row } of ordered) {
    if (row.sourceRole === 'quran_text' && row.parentSnapshotKey !== null)
      throw new Error('BATCH_QURAN_PARENT_INVALID');
    if (row.sourceRole === 'tafsir_commentary') {
      const parent = row.parentSnapshotKey && all.get(row.parentSnapshotKey);
      if (!parent || parent.sourceRole !== 'quran_text' || parent.reference !== row.reference)
        throw new Error('BATCH_COMMENTARY_PARENT_INVALID');
    }
    for (const relation of row.relations ?? [])
      if (!all.has(relation.targetSnapshotKey)) throw new Error('BATCH_RELATION_TARGET_MISSING');
  }
  const sources = [
    ...baseline.sources,
    ...ordered.map(({ source, originalRecord, seedTopic, classification }) => ({
      ...source,
      provenance: {
        ...source.provenance,
        researchBatch: {
          compilerVersion: RESEARCH_BATCH_COMPILER_VERSION,
          originalRecordId: originalRecord.id,
          originalRecordSha256: sha256(canonical(originalRecord)),
          seedTopic,
          topicProposal: classification,
          topicStatus: 'proposed',
          sourceApproval: 'pending',
        },
      },
    })),
  ];
  const corpusVersion = sha256(
    canonical({ compilerVersion: RESEARCH_BATCH_COMPILER_VERSION, sources }),
  );
  const manifest = SourceCorpusManifestSchema.parse({ ...baseline, corpusVersion, sources });
  const hashes = new Set<string>();
  let repeatedOriginalHashes = 0;
  for (const row of sources) {
    if (hashes.has(row.originalSha256)) repeatedOriginalHashes++;
    hashes.add(row.originalSha256);
  }
  return {
    manifest,
    diagnostics: {
      compilerVersion: RESEARCH_BATCH_COMPILER_VERSION,
      baselineCorpusVersion: baseline.corpusVersion,
      baselineCount: baseline.sources.length,
      newCount: ordered.length,
      combinedCount: sources.length,
      repeatedInputs,
      // Equal text at distinct locators remains distinct evidence, with attribution intact.
      repeatedOriginalHashes,
      sourceKinds: Object.fromEntries(
        ['quran_text', 'tafsir_commentary'].map((role) => [
          role,
          ordered.filter((item) => item.source.sourceRole === role).length,
        ]),
      ),
      seedTopics: Object.fromEntries(
        [...new Set(ordered.map((item) => item.seedTopic))]
          .sort()
          .map((topic) => [topic, ordered.filter((item) => item.seedTopic === topic).length]),
      ),
      proposedTopics: Object.fromEntries(
        [...new Set(ordered.flatMap((item) => item.classification.topics))]
          .sort()
          .map((topic) => [
            topic,
            ordered.filter((item) => item.classification.topics.includes(topic)).length,
          ]),
      ),
      researchOnly: true,
      approvalStatus: 'pending',
    },
  };
}
