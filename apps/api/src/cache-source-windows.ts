import { z } from 'zod';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';
import { canonical, sha256 } from './foundation.js';
import { SOURCE_BODY_CHUNKER_VERSION } from '../../../packages/contracts/src/source-content.js';

export const CACHE_CHUNKER_VERSION = 'cache-sentence-context-v1';
export const CACHE_PASSAGE_REPRESENTATION = 'exact-contiguous-context-v1';
export const MAX_CACHE_PASSAGES = 32;
const CORE_LIMIT = 1800;
const CONTEXT_LIMIT = 3000;
const boundary = (text: string, n: number) =>
  !(n > 0 && /[\uD800-\uDBFF]/u.test(text[n - 1]!) && /[\uDC00-\uDFFF]/u.test(text[n]!));
export const CachePassageHintSchema = z
  .object({
    passageId: z.string().regex(/^cache-passage:[a-f0-9]{48}$/u),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    passageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    chunkerVersion: z.enum([CACHE_CHUNKER_VERSION, SOURCE_BODY_CHUNKER_VERSION]),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  })
  .strict();
export type CachePassageHint = z.infer<typeof CachePassageHintSchema>;
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
