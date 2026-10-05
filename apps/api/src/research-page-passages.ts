import { z } from 'zod';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';
import {
  CachePassagePreferenceSchema,
  type CachePassagePreference,
  type SemanticClaim,
  type EvidencePassageView,
} from '../../../packages/contracts/src/semantic-assessment.js';
import { canonical, sha256 } from './foundation.js';
import {
  cachePassages,
  CACHE_CHUNKER_VERSION,
  CachePassageHintSchema as HintSchema,
  type CachePassage,
  type CachePassageHint,
} from './cache-source-windows.js';
export {
  cachePassages,
  CACHE_CHUNKER_VERSION,
  CACHE_PASSAGE_REPRESENTATION,
  MAX_CACHE_PASSAGES,
  type CachePassage,
  type CachePassageHint,
} from './cache-source-windows.js';
import { SOURCE_BODY_CHUNKER_VERSION } from '../../../packages/contracts/src/source-content.js';
import { sourceContentPassages } from './source-content-view.js';

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
  let selection: unknown = source.provenance.sourceContentSelection;
  if (preferences) {
    const selected = preferences.find(
      (p) => p.evidenceKey === source.snapshotKey && p.querySha256 === sha256(query ?? ''),
    );
    if (!selected) return [];
    const parsed = CachePassagePreferenceSchema.parse(selected);
    selection = parsed.contentSelection;
    const built =
      parsed.chunkerVersion === SOURCE_BODY_CHUNKER_VERSION
        ? sourceContentPassages(source, selection)
        : cachePassages(source);
    if (
      parsed.originalSha256 !== source.originalSha256 ||
      canonical(parsed.coverage) !== canonical(built.coverage) ||
      parsed.hits.some((h) => h.chunkerVersion !== parsed.chunkerVersion) ||
      (parsed.chunkerVersion === CACHE_CHUNKER_VERSION && selection !== undefined)
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
  const version = hints[0]?.chunkerVersion;
  if (hints.some((h) => h.chunkerVersion !== version)) throw Error('CACHE_PASSAGE_HINT_INVALID');
  const originals =
    version === SOURCE_BODY_CHUNKER_VERSION
      ? sourceContentPassages(source, selection).passages
      : cachePassages(source).passages;
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
  const bodyView = hits[0]!.chunkerVersion === SOURCE_BODY_CHUNKER_VERSION;
  const content = bodyView
    ? sourceContentPassages(source, source.provenance.sourceContentSelection)
    : undefined;
  const built = content ?? cachePassages(source);
  return CachePassagePreferenceSchema.parse({
    claimId: claim.id,
    evidenceKey: source.snapshotKey,
    originalSha256: source.originalSha256,
    querySha256: sha256(claim.originalText),
    chunkerVersion: hits[0]!.chunkerVersion,
    ...(content ? { contentSelection: content.selection } : {}),
    hits,
    coverage: built.coverage,
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
    sourceContentSelection: _selection,
    sourceContentViewStatus: _viewStatus,
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
  const selectedView =
    next.provenance.sourceContentSelection ?? first.provenance.sourceContentSelection;
  if (
    first.provenance.sourceContentSelection &&
    next.provenance.sourceContentSelection &&
    canonical(first.provenance.sourceContentSelection) !==
      canonical(next.provenance.sourceContentSelection)
  )
    throw Error('SOURCE_CONTENT_VIEW_COLLISION');
  const maps = preferNext ? [after, before] : [before, after],
    merged: Record<string, CachePassageHint[]> = {};
  for (const m of maps)
    for (const [key, hints] of Object.entries(m)) {
      if (!merged[key] && Object.keys(merged).length === 5) continue;
      const candidates = [
        ...new Map([...(merged[key] ?? []), ...hints].map((h) => [h.passageId, h])).values(),
      ];
      const hasBody = candidates.some((h) => h.chunkerVersion === SOURCE_BODY_CHUNKER_VERSION);
      merged[key] = candidates
        .filter((h) => !hasBody || h.chunkerVersion === SOURCE_BODY_CHUNKER_VERSION)
        .slice(0, 3);
    }
  return {
    ...first,
    retrievalModes: [...new Set([...first.retrievalModes, ...next.retrievalModes])],
    provenance: {
      ...first.provenance,
      ...(selectedView ? { sourceContentSelection: selectedView } : {}),
      cachePassageHitsByQuery: merged,
    },
  };
}
