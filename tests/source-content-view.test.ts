import { expect, it } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import {
  sourceBlocks,
  selectSourceContent,
  sourceContentPassages,
  validateSourceContentSelection,
} from '../apps/api/src/source-content-view.js';
import {
  bindCachePassageHits,
  cachePassagePreference,
  preferredCachePassages,
  passageHint,
} from '../apps/api/src/research-page-passages.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
import type { SourceBlockDecision } from '../packages/contracts/src/source-content.js';
const protectedText =
  '😀 **الشيخ:** لا يلزم الإذن فيما يضر، لكن يلزم الإحسان.\n\n1. المصدر: كتاب الأصل.\n\n2. تصحيح: يجوز السفر وإن لم يشق، ومن صام فلا حرج عليه.\n\n';
const navigation =
  '[موضوع آخر](https://example.com/fatwas/2/other)\n\n[تصنيف](https://example.com/categories/one)\n\n[موضوع ثالث](https://example.com/fatwas/3/other)\n\n[تصنيف آخر](https://example.com/categories/two)\n';
function fixture(text = protectedText + navigation): SourceEvidence {
  return {
    snapshotKey: 'web-cache:' + sha256(text),
    sourceId: 'web-owned',
    sourceVersion: 'v1',
    sourceRole: 'scholar_explanation',
    reference: 'Owned fixture',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned',
    author: null,
    edition: null,
    sourceUrl: 'https://example.com/fatwas/1/article',
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: {},
  };
}
const trace = {
  modelId: 'synthetic-test',
  promptVersion: 'synthetic-test',
  requestSha256: 'a'.repeat(64),
  responseSha256: 'b'.repeat(64),
};
const decisions = (source: SourceEvidence, label: SourceBlockDecision['label'] = 'navigation') =>
  sourceBlocks(source).map((b) => ({ blockId: b.blockId, label }));
it('partitions the complete original with exact Unicode offsets and preserves source bytes', () => {
  const source = fixture(),
    before = structuredClone(source),
    blocks = sourceBlocks(source);
  expect(blocks.map((b) => b.originalText).join('')).toBe(source.originalText);
  for (const b of blocks) {
    expect(source.originalText.slice(b.startOffset, b.endOffset)).toBe(b.originalText);
    expect([...source.originalText.slice(0, b.startOffset)].length).toBe(b.codePointStart);
    expect(sha256(b.originalText)).toBe(b.textSha256);
  }
  expect(source).toEqual(before);
});
it('requires model and structural agreement, protecting dialogue, negation and corrective numbered footnotes even when mislabelled', () => {
  const source = fixture(),
    view = selectSourceContent(
      { ...source, sourceUrl: source.sourceUrl! },
      decisions(source),
      trace,
    );
  expect(view.selection.removedBlocks).toHaveLength(4);
  expect(view.retainedBlocks.map((b) => b.originalText).join('')).toBe(protectedText);
  const uncertain = selectSourceContent(
    { ...source, sourceUrl: source.sourceUrl! },
    decisions(source, 'uncertain'),
    trace,
  );
  expect(uncertain.selection.removedBlocks).toEqual([]);
  expect(uncertain.retainedBlocks.map((b) => b.originalText).join('')).toBe(source.originalText);
});
it('retains ambiguous plain title tails and standalone citation links without a related-category cluster', () => {
  for (const text of [
    protectedText + 'قضاء الصيام\n\nأحكام السفر',
    protectedText + '[المصدر](https://example.com/fatwas/5/reference)',
  ]) {
    const source = fixture(text),
      view = selectSourceContent(
        { ...source, sourceUrl: source.sourceUrl! },
        decisions(source),
        trace,
      );
    expect(view.selection.removedBlocks).toEqual([]);
  }
});
it('recognizes the observed ordered player/download controls only beside the exact audio structure and with model agreement', () => {
  const player = 'play\n\n00:00\n\nmax volume\n\n- ×null\n\n';
  const audio =
    '[تحميل المادة](https://files.zadapps.info/binbaz.org.sa/fatawa/nour_3la_aldarb/nour_342/34205.mp3)\n\n';
  const source = fixture(
    '**السؤال:** سؤال محفوظ.\n\n' + player + audio + '**الجواب:** لا يلزم ذلك إلا عند الحاجة.',
  );
  const view = selectSourceContent(
    { ...source, sourceUrl: source.sourceUrl! },
    decisions(source, 'audio_download'),
    trace,
  );
  expect(view.selection.removedBlocks).toHaveLength(5);
  const retained = view.retainedBlocks.map((b) => b.originalText).join('');
  expect(retained).toContain('لا يلزم ذلك إلا عند الحاجة');
  expect(retained).not.toContain('max volume');
  const unanchored = fixture('المتن محفوظ.\n\n' + player + 'استثناء محفوظ.');
  expect(
    selectSourceContent(
      { ...unanchored, sourceUrl: unanchored.sourceUrl! },
      decisions(unanchored, 'audio_download'),
      trace,
    ).selection.removedBlocks,
  ).toEqual([]);
  const uncertain = selectSourceContent(
    { ...source, sourceUrl: source.sourceUrl! },
    decisions(source, 'uncertain'),
    trace,
  );
  expect(uncertain.selection.removedBlocks).toEqual([]);
});
it('rejects omitted, duplicate or invented labels and forged parent/selection bindings', () => {
  const source = fixture(),
    all = decisions(source),
    page = { ...source, sourceUrl: source.sourceUrl! };
  for (const labels of [
    all.slice(1),
    [all[0]!, ...all.slice(0, -1)],
    [...all.slice(1), { blockId: 'source-block:' + 'f'.repeat(32), label: 'navigation' as const }],
  ])
    expect(() => selectSourceContent(page, labels, trace)).toThrow(
      'SOURCE_CONTENT_LABEL_COVERAGE_INVALID',
    );
  const { selection } = selectSourceContent(page, all, trace);
  for (const changed of [
    { ...selection, originalSha256: 'f'.repeat(64) },
    { ...selection, sourceUrl: 'https://example.com/fatwas/other' },
    { ...selection, selectionSha256: 'f'.repeat(64) },
  ])
    expect(() => validateSourceContentSelection(source, changed)).toThrow();
});
it('never concatenates across an excluded interior audio block and binds every body window to the original', () => {
  const source = fixture(
    'الفقرة الأولى ملزمة.\n\n[تحميل الصوت](https://example.com/audio/file.mp3)\n\nالفقرة الثانية استثناء محفوظ.',
  );
  const labels = decisions(source, 'article').map((d, i) => ({
    ...d,
    label: i === 1 ? ('audio_download' as const) : d.label,
  }));
  const { selection } = selectSourceContent(
      { ...source, sourceUrl: source.sourceUrl! },
      labels,
      trace,
    ),
    built = sourceContentPassages(source, selection);
  expect(built.passages).toHaveLength(2);
  for (const p of built.passages) {
    expect(source.originalText.slice(p.startOffset, p.endOffset)).toBe(p.originalText);
    expect(p.originalText).not.toContain('file.mp3');
    expect(p.contextTruncated).toBe(true);
    expect(p.originalSha256).toBe(source.originalSha256);
    expect(p.codePointStart).toBe([...source.originalText.slice(0, p.startOffset)].length);
  }
  expect(built.coverage.fullTextIndexed).toBe(false);
});
it('marks each window partial when qualifying retained groups remain beyond excluded audio', () => {
  const texts = [
    'المتن الأول: يجوز الفعل.',
    'نقل ثان محفوظ.',
    'نقل ثالث محفوظ.',
    'الاستثناء النهائي: إلا عند الضرر.',
  ];
  const source = fixture(texts.join('\n\n[تحميل الصوت](https://example.com/audio/file.mp3)\n\n'));
  const labels = sourceBlocks(source).map((b) => ({
    blockId: b.blockId,
    label: b.originalText.includes('file.mp3') ? ('audio_download' as const) : ('article' as const),
  }));
  const { selection } = selectSourceContent(
    { ...source, sourceUrl: source.sourceUrl! },
    labels,
    trace,
  );
  const built = sourceContentPassages(source, selection);
  expect(built.passages).toHaveLength(4);
  expect(built.passages.every((p) => p.contextTruncated)).toBe(true);
  expect(built.passages[0]!.originalText).not.toContain('الاستثناء النهائي');
  expect(built.passages[3]!.originalText).toContain('إلا عند الضرر');
  for (const p of built.passages)
    expect(source.originalText.slice(p.startOffset, p.endOffset)).toBe(p.originalText);
});
it('resolves the same body windows from query-bound and durable claim preferences without changing originals', () => {
  const source = fixture(),
    { selection } = selectSourceContent(
      { ...source, sourceUrl: source.sourceUrl! },
      decisions(source),
      trace,
    ),
    built = sourceContentPassages(source, selection),
    claimText = 'يلزم الإحسان';
  const found = {
    ...source,
    provenance: {
      sourceContentSelection: selection,
      cachePassageQuerySha256: sha256(claimText),
      cachePassageHits: [passageHint(built.passages[0]!)],
    },
  };
  const bound = bindCachePassageHits(found, claimText, claimText),
    claim = {
      id: 'claim-' + 'a'.repeat(24),
      segmentId: 'author',
      startOffset: 0,
      endOffset: claimText.length,
      originalText: claimText,
      evidenceKeys: [source.snapshotKey],
      provisional: true as const,
    };
  const preference = cachePassagePreference(bound, claim)!;
  expect(preference.contentSelection).toEqual(selection);
  expect(preferredCachePassages(source, claimText, [preference])).toEqual(
    preferredCachePassages(bound, claimText),
  );
  expect(preferredCachePassages(source, claimText, [preference])[0]!.originalText).toBe(
    protectedText,
  );
  expect(source.provenance).toEqual({});
});
