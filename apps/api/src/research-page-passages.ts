import { z } from 'zod';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';
import {
  CachePassagePreferenceSchema,
  type CachePassagePreference,
  type SemanticClaim,
  type EvidencePassageView,
} from '../../../packages/contracts/src/semantic-assessment.js';
import { canonical, sha256 } from './foundation.js';

export const CACHE_CHUNKER_VERSION = 'cache-sentence-context-v1';
export const CACHE_PASSAGE_REPRESENTATION = 'exact-contiguous-context-v1';
export const MAX_CACHE_PASSAGES = 32;
const CORE_LIMIT = 1800;
const CONTEXT_LIMIT = 3000;
const boundary = (text: string, n: number) =>
  !(n > 0 && /[\uD800-\uDBFF]/u.test(text[n - 1]!) && /[\uDC00-\uDFFF]/u.test(text[n]!));
const HintSchema = z
  .object({
    passageId: z.string().regex(/^cache-passage:[a-f0-9]{48}$/u),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    passageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    chunkerVersion: z.literal(CACHE_CHUNKER_VERSION),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  })
  .strict();
export type CachePassageHint = z.infer<typeof HintSchema>;
export type CachePassage = CachePassageHint & {
  parentSnapshotKey: string;
  coreStart: number;
  coreEnd: number;
  codePointStart: number;
  codePointEnd: number;
  codePointCoreStart: number;
  codePointCoreEnd: number;
  originalText: string;
  contextTruncated: boolean;
  boundaryTruncated: boolean;
};

/** Query-independent exact source units; relevance and religious completeness are not inferred. */
export function cachePassages(source: SourceEvidence) {
  const text = source.originalText;
  if (text.length > 30000 || !text.length || sha256(text) !== source.originalSha256)
    throw Error('CACHE_PASSAGE_PARENT_INVALID');
  const units = [...text.matchAll(/[^.؛؟?!\n]+[.؛؟?!\n]*|[.؛؟?!\n]+/gu)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const cores: Array<{ start: number; end: number; cut: boolean; first: number; last: number }> =
    [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    if (unit.end - unit.start > CORE_LIMIT) {
      for (let start = unit.start; start < unit.end;) {
        let end = Math.min(unit.end, start + CORE_LIMIT);
        if (!boundary(text, end)) end--;
        cores.push({ start, end, cut: true, first: i, last: i });
        start = end;
      }
    } else {
      let end = unit.end,
        last = i;
      while (last + 1 < units.length && units[last + 1]!.end - unit.start <= CORE_LIMIT) {
        last++;
        end = units[last]!.end;
      }
      cores.push({ start: unit.start, end, cut: false, first: i, last });
      i = last;
    }
  }
  const selected = cores.slice(0, MAX_CACHE_PASSAGES);
  const passages: CachePassage[] = selected.map((core) => {
    let start = core.start,
      end = core.end;
    if (!core.cut) {
      const previous = units[Math.max(0, core.first - 1)]!.start;
      const next = units[Math.min(units.length - 1, core.last + 1)]!.end;
      // Add whole neighbors only; never manufacture complete context by slicing a sentence.
      if (next - previous <= CONTEXT_LIMIT) {
        start = previous;
        end = next;
      } else if (core.end - previous <= CONTEXT_LIMIT) start = previous;
      else if (next - core.start <= CONTEXT_LIMIT) end = next;
    }
    const originalText = text.slice(start, end);
    return {
      passageId:
        'cache-passage:' +
        sha256(
          canonical([
            source.snapshotKey,
            source.originalSha256,
            CACHE_CHUNKER_VERSION,
            start,
            end,
            core.start,
            core.end,
          ]),
        ).slice(0, 48),
      parentSnapshotKey: source.snapshotKey,
      originalSha256: source.originalSha256,
      passageSha256: sha256(originalText),
      chunkerVersion: CACHE_CHUNKER_VERSION,
      startOffset: start,
      endOffset: end,
      coreStart: core.start,
      coreEnd: core.end,
      codePointStart: Array.from(text.slice(0, start)).length,
      codePointEnd: Array.from(text.slice(0, end)).length,
      codePointCoreStart: Array.from(text.slice(0, core.start)).length,
      codePointCoreEnd: Array.from(text.slice(0, core.end)).length,
      originalText,
      contextTruncated: start > 0 || end < text.length,
      boundaryTruncated: core.cut,
    };
  });
  const coveredUtf16Units = selected.reduce((n, c) => n + c.end - c.start, 0);
  return {
    passages,
    coverage: {
      chunkerVersion: CACHE_CHUNKER_VERSION,
      passageCount: passages.length,
      coveredUtf16Units,
      totalUtf16Units: text.length,
      fullTextIndexed: coveredUtf16Units === text.length,
      boundaryTruncatedCount: passages.filter((p) => p.boundaryTruncated).length,
    },
  };
}
export function passageHint(p: CachePassage): CachePassageHint {
  return HintSchema.parse({
    passageId: p.passageId,
    originalSha256: p.originalSha256,
    passageSha256: p.passageSha256,
    chunkerVersion: p.chunkerVersion,
    startOffset: p.startOffset,
    endOffset: p.endOffset,
  });
}
/** Query-derived hints are report-local; never inserted into the shared public parent. */
const HintsSchema = z.array(HintSchema).max(3);
const BindingsSchema = z
  .record(z.string().regex(/^[a-f0-9]{64}$/u), HintsSchema)
  .refine((m) => Object.keys(m).length <= 5);
export function preferredCachePassages(
  source: SourceEvidence,
  query?: string,
  preferences?: readonly CachePassagePreference[],
): EvidencePassageView[] {
  let raw: unknown;
  if (preferences) {
    const selected = preferences.find(
      (p) => p.evidenceKey === source.snapshotKey && p.querySha256 === sha256(query ?? ''),
    );
    if (!selected) return [];
    const parsed = CachePassagePreferenceSchema.parse(selected);
    if (
      parsed.originalSha256 !== source.originalSha256 ||
      canonical(parsed.coverage) !== canonical(cachePassages(source).coverage)
    )
      throw Error('CACHE_PASSAGE_PREFERENCE_INVALID');
    raw = parsed.hits;
  } else if (source.provenance.cachePassageHitsByQuery !== undefined) {
    const bindings = BindingsSchema.parse(source.provenance.cachePassageHitsByQuery);
    raw = query === undefined ? undefined : bindings[sha256(query)];
  } else if (query === undefined || source.provenance.cachePassageQuerySha256 === sha256(query))
    raw = source.provenance.cachePassageHits;
  if (raw === undefined) return [];
  const hints = HintsSchema.parse(raw);
  const originals = cachePassages(source).passages;
  return hints.map((hint) => {
    const p = originals.find((p) => p.passageId === hint.passageId);
    if (!p || canonical(passageHint(p)) !== canonical(hint))
      throw Error('CACHE_PASSAGE_HINT_INVALID');
    return {
      passageId: `passage-${sha256(canonical([source.snapshotKey, source.originalSha256, p.startOffset, p.endOffset])).slice(0, 24)}`,
      evidenceKey: source.snapshotKey,
      originalSha256: p.originalSha256,
      startOffset: p.startOffset,
      endOffset: p.endOffset,
      offsetUnit: 'utf16_code_unit' as const,
      originalText: p.originalText,
      contextTruncated: p.contextTruncated,
      boundaryTruncated: p.boundaryTruncated,
      relevance: 0,
    };
  });
}
export function cachePassagePreference(
  source: SourceEvidence,
  claim: SemanticClaim,
): CachePassagePreference | undefined {
  const maps = BindingsSchema.parse(source.provenance.cachePassageHitsByQuery ?? {}),
    hits = maps[sha256(claim.originalText)];
  if (!hits?.length) return undefined;
  preferredCachePassages(source, claim.originalText);
  return CachePassagePreferenceSchema.parse({
    claimId: claim.id,
    evidenceKey: source.snapshotKey,
    originalSha256: source.originalSha256,
    querySha256: sha256(claim.originalText),
    chunkerVersion: CACHE_CHUNKER_VERSION,
    hits,
    coverage: cachePassages(source).coverage,
  });
}
export function validateCachePassagePreferences(
  preferences: readonly CachePassagePreference[],
  claims: readonly SemanticClaim[],
  evidence: readonly SourceEvidence[],
) {
  const parsed = z.array(CachePassagePreferenceSchema).max(40).parse(preferences),
    seen = new Set<string>();
  for (const p of parsed) {
    const claim = claims.find((c) => c.id === p.claimId),
      source = evidence.find((e) => e.snapshotKey === p.evidenceKey);
    const identity = p.claimId + '|' + p.evidenceKey;
    if (
      !claim ||
      !source ||
      !claim.evidenceKeys.includes(p.evidenceKey) ||
      p.querySha256 !== sha256(claim.originalText) ||
      seen.has(identity)
    )
      throw Error('CACHE_PASSAGE_PREFERENCE_INVALID');
    seen.add(identity);
    preferredCachePassages(source, claim.originalText, [p]);
  }
  return parsed;
}
export function stripCachePassageProvenance(source: SourceEvidence): SourceEvidence {
  const {
    cachePassageHits: _hits,
    cachePassageQuerySha256: _query,
    cachePassageHitsByQuery: _map,
    passageIndexCoverage: _coverage,
    passageIndexStatus: _status,
    ...provenance
  } = source.provenance;
  return { ...source, provenance };
}
export function bindCachePassageHits(
  source: SourceEvidence,
  claimText: string,
  searchQuery: string,
): SourceEvidence {
  if (source.provenance.cachePassageHits === undefined) return source;
  if (source.provenance.cachePassageQuerySha256 !== sha256(searchQuery))
    throw Error('CACHE_PASSAGE_QUERY_BINDING_INVALID');
  preferredCachePassages(source, searchQuery);
  const { cachePassageHits, cachePassageQuerySha256: _query, ...provenance } = source.provenance;
  return {
    ...source,
    provenance: {
      ...provenance,
      cachePassageHitsByQuery: { [sha256(claimText)]: HintsSchema.parse(cachePassageHits) },
    },
  };
}
export function mergeCachePassageHits(
  first: SourceEvidence,
  next: SourceEvidence,
  preferNext = false,
): SourceEvidence {
  if (!first.provenance.cachePassageHitsByQuery && !next.provenance.cachePassageHitsByQuery)
    return next;
  if (
    first.snapshotKey !== next.snapshotKey ||
    first.originalSha256 !== next.originalSha256 ||
    first.originalText !== next.originalText
  )
    throw Error('CACHE_PASSAGE_IDENTITY_COLLISION');
  const before = BindingsSchema.parse(first.provenance.cachePassageHitsByQuery ?? {}),
    after = BindingsSchema.parse(next.provenance.cachePassageHitsByQuery ?? {});
  const maps = preferNext ? [after, before] : [before, after],
    merged: Record<string, CachePassageHint[]> = {};
  for (const m of maps)
    for (const [key, hints] of Object.entries(m)) {
      if (!merged[key] && Object.keys(merged).length === 5) continue;
      merged[key] = [
        ...new Map([...(merged[key] ?? []), ...hints].map((h) => [h.passageId, h])).values(),
      ].slice(0, 3);
    }
  return {
    ...first,
    retrievalModes: [...new Set([...first.retrievalModes, ...next.retrievalModes])],
    provenance: { ...first.provenance, cachePassageHitsByQuery: merged },
  };
}
