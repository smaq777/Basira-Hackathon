import { canonical, sha256 } from './foundation.js';
import { cachePassages, type CachePassage } from './cache-source-windows.js';
import type { SourceEvidence } from '../../../packages/contracts/src/foundation.js';
import {
  SOURCE_BLOCK_SCHEME,
  SOURCE_CONTENT_VIEW_VERSION,
  SOURCE_BODY_CHUNKER_VERSION,
  SourceBlockDecisionSchema,
  SourceContentSelectionSchema,
  type SourceBlockDecision,
  type SourceContentSelection,
} from '../../../packages/contracts/src/source-content.js';

export type SourceBlock = {
  blockId: string;
  startOffset: number;
  endOffset: number;
  codePointStart: number;
  codePointEnd: number;
  originalText: string;
  textSha256: string;
};
/** Complete source partition. Blank-line delimiters belong to their preceding block. */
export function sourceBlocks(page: { originalText: string; originalSha256: string }) {
  const text = page.originalText;
  if (!text.trim() || text.length > 30000 || sha256(text) !== page.originalSha256)
    throw Error('SOURCE_CONTENT_ORIGINAL_INVALID');
  const blocks = [...text.matchAll(/[\s\S]+?(?:\r?\n[ \t]*\r?\n+|$)/gu)].map((m) => {
    const startOffset = m.index,
      endOffset = startOffset + m[0].length;
    return {
      blockId:
        'source-block:' +
        sha256(canonical([SOURCE_BLOCK_SCHEME, page.originalSha256, startOffset, endOffset])).slice(
          0,
          32,
        ),
      startOffset,
      endOffset,
      codePointStart: [...text.slice(0, startOffset)].length,
      codePointEnd: [...text.slice(0, endOffset)].length,
      originalText: m[0],
      textSha256: sha256(m[0]),
    };
  });
  if (blocks.length > 128 || blocks.map((b) => b.originalText).join('') !== text)
    throw Error('SOURCE_CONTENT_BLOCK_LIMIT');
  return blocks;
}

function standaloneLinks(block: SourceBlock) {
  const links = [...block.originalText.matchAll(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gu)];
  if (
    !links.length ||
    block.originalText.replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gu, '').trim()
  )
    return [];
  return links.map((m) => ({ label: m[1]!, url: new URL(m[2]!) }));
}
/** Structural agreement is deliberately narrow; model labels alone cannot remove prose. */
export function removableSourceBlocks(blocks: SourceBlock[], sourceUrl: string) {
  const page = new URL(sourceUrl),
    eligible = new Map<string, 'related_links' | 'audio_download'>();
  const tail: SourceBlock[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (!standaloneLinks(blocks[i]!).length) break;
    tail.unshift(blocks[i]!);
  }
  const categoryLinks = tail
    .flatMap(standaloneLinks)
    .filter((l) => l.url.hostname === page.hostname && /^\/categories\//u.test(l.url.pathname));
  const relatedLinks = tail
    .flatMap(standaloneLinks)
    .filter(
      (l) =>
        l.url.hostname === page.hostname &&
        /^\/fatwas\/\d+\//u.test(l.url.pathname) &&
        l.url.pathname !== page.pathname,
    );
  if (categoryLinks.length >= 2 && relatedLinks.length >= 2)
    for (const block of tail) {
      const links = standaloneLinks(block);
      if (
        links.every(
          (l) =>
            l.url.hostname === page.hostname &&
            (/^\/categories\//u.test(l.url.pathname) ||
              (/^\/fatwas\/\d+\//u.test(l.url.pathname) && l.url.pathname !== page.pathname)),
        )
      )
        eligible.set(block.blockId, 'related_links');
    }
  for (const [index, block] of blocks.entries()) {
    const links = standaloneLinks(block);
    if (
      links.length &&
      links.every(
        (l) =>
          /^(?:تحميل|تحميل المادة|تحميل الصوت|تحميل الملف الصوتي|استماع|MP3)$/iu.test(
            l.label.trim(),
          ) && /\.(?:mp3|wav|ogg)(?:$|\?)/iu.test(l.url.pathname),
      )
    ) {
      eligible.set(block.blockId, 'audio_download');
      // Exact observed ordered player chrome, only next to a verified audio link.
      const player = blocks.slice(Math.max(0, index - 4), index);
      if (
        player.length === 4 &&
        player[0]!.originalText.trim() === 'play' &&
        player[1]!.originalText.trim() === '00:00' &&
        player[2]!.originalText.trim() === 'max volume' &&
        /^-\s*×null$/u.test(player[3]!.originalText.trim())
      )
        for (const control of player) eligible.set(control.blockId, 'audio_download');
    }
  }
  return eligible;
}
const selectionBinding = (
  page: { originalSha256: string; sourceUrl: string },
  removedBlocks: SourceBlockDecision[],
) =>
  sha256(
    canonical([
      SOURCE_BLOCK_SCHEME,
      SOURCE_CONTENT_VIEW_VERSION,
      page.originalSha256,
      page.sourceUrl,
      removedBlocks,
    ]),
  );
export function selectSourceContent(
  page: { originalText: string; originalSha256: string; sourceUrl: string },
  decisions: SourceBlockDecision[],
  trace: Pick<
    SourceContentSelection,
    'modelId' | 'promptVersion' | 'requestSha256' | 'responseSha256'
  >,
) {
  const blocks = sourceBlocks(page),
    labels = decisions.map((d) => SourceBlockDecisionSchema.parse(d));
  if (
    labels.length !== blocks.length ||
    new Set(labels.map((d) => d.blockId)).size !== blocks.length ||
    labels.some((d) => !blocks.some((b) => b.blockId === d.blockId))
  )
    throw Error('SOURCE_CONTENT_LABEL_COVERAGE_INVALID');
  const allowed = removableSourceBlocks(blocks, page.sourceUrl);
  const removedBlocks = blocks.flatMap((b) => {
    const label = labels.find((d) => d.blockId === b.blockId)!.label,
      structural = allowed.get(b.blockId);
    return structural &&
      (label === structural || (structural === 'related_links' && label === 'navigation'))
      ? [{ blockId: b.blockId, label }]
      : [];
  });
  const selection = SourceContentSelectionSchema.parse({
    blockScheme: SOURCE_BLOCK_SCHEME,
    viewVersion: SOURCE_CONTENT_VIEW_VERSION,
    originalSha256: page.originalSha256,
    sourceUrl: page.sourceUrl,
    selectionSha256: selectionBinding(page, removedBlocks),
    removedBlocks,
    modelId: trace.modelId,
    promptVersion: trace.promptVersion,
    requestSha256: trace.requestSha256,
    responseSha256: trace.responseSha256,
  });
  if (removedBlocks.length === blocks.length) throw Error('SOURCE_CONTENT_EMPTY_RETAINED_VIEW');
  return {
    selection,
    blocks,
    decisions: labels,
    retainedBlocks: blocks.filter((b) => !removedBlocks.some((r) => r.blockId === b.blockId)),
  };
}
export function validateSourceContentSelection(source: SourceEvidence, raw: unknown) {
  const selection = SourceContentSelectionSchema.parse(raw),
    blocks = sourceBlocks(source);
  if (
    selection.originalSha256 !== source.originalSha256 ||
    selection.sourceUrl !== source.sourceUrl ||
    new Set(selection.removedBlocks.map((b) => b.blockId)).size !==
      selection.removedBlocks.length ||
    selection.selectionSha256 !==
      selectionBinding(
        { originalSha256: source.originalSha256, sourceUrl: source.sourceUrl! },
        selection.removedBlocks,
      )
  )
    throw Error('SOURCE_CONTENT_SELECTION_BINDING_INVALID');
  const allowed = removableSourceBlocks(blocks, source.sourceUrl!);
  for (const r of selection.removedBlocks) {
    const structural = allowed.get(r.blockId);
    if (
      !structural ||
      !(r.label === structural || (structural === 'related_links' && r.label === 'navigation'))
    )
      throw Error('SOURCE_CONTENT_REMOVAL_FORBIDDEN');
  }
  if (selection.removedBlocks.length === blocks.length)
    throw Error('SOURCE_CONTENT_EMPTY_RETAINED_VIEW');
  return {
    selection,
    blocks,
    retainedBlocks: blocks.filter(
      (b) => !selection.removedBlocks.some((r) => r.blockId === b.blockId),
    ),
  };
}
/** Every delivered span is one contiguous substring of the unchanged original. */
export function sourceContentPassages(source: SourceEvidence, raw: unknown) {
  const { selection, blocks, retainedBlocks } = validateSourceContentSelection(source, raw);
  const groups: Array<{ start: number; end: number }> = [];
  for (const b of retainedBlocks) {
    const prior = groups.at(-1);
    if (prior?.end === b.startOffset) prior.end = b.endOffset;
    else groups.push({ start: b.startOffset, end: b.endOffset });
  }
  const passages: CachePassage[] = [];
  for (const group of groups) {
    const text = source.originalText.slice(group.start, group.end);
    const built = cachePassages({ ...source, originalText: text, originalSha256: sha256(text) });
    for (const p of built.passages) {
      if (passages.length === 32) break;
      const startOffset = p.startOffset + group.start,
        endOffset = p.endOffset + group.start;
      const coreStart = p.coreStart + group.start,
        coreEnd = p.coreEnd + group.start;
      passages.push({
        ...p,
        contextTruncated: retainedBlocks.some(
          (b) => b.startOffset < startOffset || b.endOffset > endOffset,
        ),
        passageId:
          'cache-passage:' +
          sha256(
            canonical([
              SOURCE_BODY_CHUNKER_VERSION,
              selection.selectionSha256,
              source.snapshotKey,
              startOffset,
              endOffset,
              coreStart,
              coreEnd,
            ]),
          ).slice(0, 48),
        originalSha256: source.originalSha256,
        chunkerVersion: SOURCE_BODY_CHUNKER_VERSION,
        startOffset,
        endOffset,
        coreStart,
        coreEnd,
        codePointStart: [...source.originalText.slice(0, startOffset)].length,
        codePointEnd: [...source.originalText.slice(0, endOffset)].length,
        codePointCoreStart: [...source.originalText.slice(0, coreStart)].length,
        codePointCoreEnd: [...source.originalText.slice(0, coreEnd)].length,
      });
    }
  }
  const coveredUtf16Units = passages.reduce((n, p) => n + p.coreEnd - p.coreStart, 0);
  return {
    selection,
    passages,
    coverage: {
      chunkerVersion: SOURCE_BODY_CHUNKER_VERSION,
      passageCount: passages.length,
      coveredUtf16Units,
      totalUtf16Units: source.originalText.length,
      fullTextIndexed: coveredUtf16Units === source.originalText.length,
      boundaryTruncatedCount: passages.filter((p) => p.boundaryTruncated).length,
    },
    contentCoverage: {
      totalBlocks: blocks.length,
      retainedBlocks: retainedBlocks.length,
      removedBlocks: selection.removedBlocks.length,
      removedUtf16Units: blocks
        .filter((b) => selection.removedBlocks.some((r) => r.blockId === b.blockId))
        .reduce((n, b) => n + b.endOffset - b.startOffset, 0),
    },
  };
}
