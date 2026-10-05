import type {
  FoundationIntake,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import {
  ClaimSelectionOutputSchema,
  type EvidencePassageView,
  type SemanticClaim,
  type CachePassagePreference,
} from '../../../packages/contracts/src/semantic-assessment.js';
import { canonical, sha256 } from './foundation.js';
import { assessClaimApplicability } from '../../../packages/contracts/src/claim-applicability.js';
import { preferredCachePassages } from './research-page-passages.js';

export interface ClaimCandidate extends Omit<SemanticClaim, 'evidenceKeys'> {
  candidateId: string;
}
export interface ClaimInventory {
  candidates: ClaimCandidate[];
  excluded: Array<{
    startOffset: number;
    endOffset: number;
    reason: 'question' | 'quotation' | 'framing' | 'span_too_long';
  }>;
}

export function utf16Boundary(text: string, offset: number): boolean {
  return !(
    text.charCodeAt(offset) >= 0xdc00 &&
    text.charCodeAt(offset) <= 0xdfff &&
    text.charCodeAt(offset - 1) >= 0xd800 &&
    text.charCodeAt(offset - 1) <= 0xdbff
  );
}

/** Syntactic inventory, not a truth or semantic completeness determination. */
export function claimInventory(intake: FoundationIntake): ClaimInventory {
  const candidates: ClaimCandidate[] = [];
  const excluded: ClaimInventory['excluded'] = [];
  const quotes = [
    ...intake.originalText.matchAll(/«[^«»]*»|﴿[^﴿﴾]*﴾|“[^“”]*”|"[^"\n]*"|\{[^{}]*\}/gu),
  ].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  // Recognized bracketed references are bibliographic framing, not assertions.
  // Do not remove arbitrary brackets or parenthesized author qualifications.
  const referenceKey = (text: string) =>
    text
      .replace(/[\u064b-\u065f\u0670ـ\s]/gu, '')
      .replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const references = new Set(intake.evidence.map((row) => referenceKey(row.reference)));
  const quranReferences = new Set(
    intake.evidence
      .filter((row) => row.sourceRole === 'quran_text')
      .map((row) => referenceKey(row.reference)),
  );
  const citationRanges = [...intake.originalText.matchAll(/\[([^\[\]\n]{1,120})\]/gu)]
    .filter((match) => {
      const key = referenceKey(match[1]!);
      if (references.has(key)) return true;
      const namedQuran = key.match(/^[\p{L}]+:([0-9]{1,3}:[0-9]{1,3})$/u);
      return !!namedQuran && quranReferences.has(namedQuran[1]!);
    })
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
  quotes.push(...citationRanges);
  // Parentheses are quotations only when introduced as reported source speech.
  // Parenthesized author conditions remain part of their assertion.
  const stack: number[] = [];
  for (let offset = 0; offset < intake.originalText.length; offset++) {
    if (intake.originalText[offset] === '(') stack.push(offset);
    if (intake.originalText[offset] === ')' && stack.length) {
      const start = stack.pop()!;
      const before = intake.originalText
        .slice(Math.max(0, start - 150), start)
        .replace(/[\u064b-\u065f\u0670ـ]/gu, '');
      if (/(?:و?قال\s+[^:：()]{1,120}|قال|يقول)\s*[:：]\s*\(*$/u.test(before))
        quotes.push({ start, end: offset + 1 });
    }
  }
  quotes.push(
    ...intake.segments
      .filter((row) => ['ayah', 'matn', 'isnad', 'claimed_source'].includes(row.role))
      .map((row) => ({ start: row.startOffset, end: row.endOffset })),
  );
  quotes.sort((a, b) => a.start - b.start || b.end - a.end);
  const segments = intake.segments
    .filter((row) => row.role === 'author_text')
    .sort((a, b) => a.startOffset - b.startOffset || a.id.localeCompare(b.id));
  for (const segment of segments) {
    for (const match of segment.originalText.matchAll(/[^.؛؟?!\n]+[.؛؟?!]?/gu)) {
      const sentenceStart = segment.startOffset + match.index;
      const sentenceEnd = sentenceStart + match[0].length;
      if (
        /[؟?]/u.test(match[0]) ||
        /^\s*(?:ما معنى|ما هو|ما هي|هل|كيف|لماذا|متى|أين|اين|أليس|اليس|ما المقصود)\s/u.test(
          match[0],
        )
      ) {
        excluded.push({ startOffset: sentenceStart, endOffset: sentenceEnd, reason: 'question' });
        continue;
      }
      let cursor = sentenceStart;
      const ranges: Array<[number, number]> = [];
      for (const quote of quotes.filter(
        (row) => row.start < sentenceEnd && row.end > sentenceStart,
      )) {
        if (quote.start > cursor) ranges.push([cursor, quote.start]);
        excluded.push({
          startOffset: Math.max(sentenceStart, quote.start),
          endOffset: Math.min(sentenceEnd, quote.end),
          reason: citationRanges.some((row) => row.start === quote.start && row.end === quote.end)
            ? 'framing'
            : 'quotation',
        });
        cursor = Math.max(cursor, quote.end);
      }
      if (cursor < sentenceEnd) ranges.push([cursor, sentenceEnd]);
      for (let [startOffset, endOffset] of ranges) {
        const raw = intake.originalText.slice(startOffset, endOffset);
        // Strip separators and discourse framing only, never logical qualifiers.
        const leading =
          raw.match(/^[^\p{L}\p{N}]*(?:(?:لذلك|إذن|اذن|بالتالي|وعليه)\s+)?/u)?.[0].length ?? 0;
        const trailing = raw.match(/[\s.؛!،,:：]+$/u)?.[0].length ?? 0;
        startOffset += leading;
        endOffset -= trailing;
        if (endOffset <= startOffset) continue;
        const sourceIntro = intake.originalText
          .slice(startOffset, endOffset)
          .match(
            /[،\s]*(?:و?قال\s+[^()]{1,160}|قوله تعالى|(?:وقد )?كان[^()]{0,100}يقول)\s*[:：]?\s*\(*\s*$/u,
          );
        if (sourceIntro) {
          excluded.push({
            startOffset: startOffset + sourceIntro.index!,
            endOffset,
            reason: 'framing',
          });
          endOffset = startOffset + sourceIntro.index!;
          while (endOffset > startOffset && /\s/u.test(intake.originalText[endOffset - 1]!))
            endOffset--;
        }
        if (endOffset <= startOffset) continue;
        const originalText = intake.originalText.slice(startOffset, endOffset);
        if (
          /^(?:و?قال تعالى|و?قال الله|و?قال النبي|و?قال رسول الله|و?قال جل في علاه|قوله تعالى)(?:[\s:：]|$)/u.test(
            originalText,
          ) ||
          (originalText.replace(/[\u064b-\u065f\u0670ـ]/gu, '').match(/[\p{L}\p{N}]+/gu)?.length ??
            0) < 2 ||
          assessClaimApplicability({
            originalText,
            segments: [
              { ...segment, startOffset: 0, endOffset: originalText.length, originalText },
            ],
          }).status === 'not_applicable'
        ) {
          excluded.push({ startOffset, endOffset, reason: 'framing' });
          continue;
        }
        if (originalText.length > 1500) {
          // Do not divide an oversized sentence and hide its distant exception.
          excluded.push({ startOffset, endOffset, reason: 'span_too_long' });
          continue;
        }
        if (candidates.some((row) => startOffset < row.endOffset && endOffset > row.startOffset))
          continue;
        const id = `claim-${sha256(canonical([intake.revisionSha256, segment.id, startOffset, endOffset])).slice(0, 24)}`;
        candidates.push({
          id,
          candidateId: id,
          segmentId: segment.id,
          originalText,
          startOffset,
          endOffset,
          provisional: true,
        });
      }
    }
  }
  return { candidates, excluded };
}

export function resolveClaimSelection(
  intake: FoundationIntake,
  inventory: ClaimInventory,
  payload: unknown,
): { claims: SemanticClaim[]; invalid: boolean } {
  const proposals = ClaimSelectionOutputSchema.parse(payload).claims;
  const keys = new Set(intake.evidence.map((row) => row.snapshotKey));
  const selected = new Map<string, string[]>();
  const duplicates = new Set(
    proposals
      .filter(
        (row, index) =>
          proposals.findIndex((other) => other.candidateId === row.candidateId) !== index,
      )
      .map((row) => row.candidateId),
  );
  let invalid = false;
  for (const row of proposals) {
    if (
      duplicates.has(row.candidateId) ||
      !inventory.candidates.some((candidate) => candidate.id === row.candidateId) ||
      new Set(row.evidenceKeys).size !== row.evidenceKeys.length ||
      row.evidenceKeys.some((key) => !keys.has(key))
    ) {
      invalid = true;
      continue;
    }
    selected.set(row.candidateId, [...row.evidenceKeys].sort());
  }
  return {
    invalid,
    claims: inventory.candidates
      .filter((row) => selected.has(row.id))
      .map(({ candidateId: _candidateId, ...row }) => ({
        ...row,
        evidenceKeys: selected.get(row.id)!,
      })),
  };
}

const STOP = new Set([
  'في',
  'من',
  'على',
  'الى',
  'ان',
  'هذا',
  'هذه',
  'هو',
  'هي',
  'عن',
  'ما',
  'لا',
  'لم',
  'ولا',
  'مع',
  'كل',
  'كان',
  'قد',
  'ثم',
]);
function terms(text: string): string[] {
  return [
    ...new Set(
      (
        text
          .normalize('NFKC')
          .replace(/[\u064b-\u065f\u0670ـ]/gu, '')
          .replace(/[أإآ]/gu, 'ا')
          .match(/[\p{L}\p{N}]+/gu) ?? []
      )
        .map((word) => word.replace(/^ال/u, ''))
        .filter((word) => word.length > 1 && !STOP.has(word)),
    ),
  ];
}

/** Exact contiguous windows ranked by relevance, never agreement/support. */
export function evidencePassages(
  source: SourceEvidence,
  query: string,
  preferences?: readonly CachePassagePreference[],
): EvidencePassageView[] {
  if (sha256(source.originalText) !== source.originalSha256)
    throw new Error('PASSAGE_HASH_MISMATCH');
  const text = source.originalText;
  const preferred = preferredCachePassages(source, query, preferences);
  const queryTerms = terms(query);
  const sentences = [...text.matchAll(/[^.؛؟?!\n]+[.؛؟?!\n]*/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    terms: terms(match[0]),
  }));
  const score = (words: string[]) => queryTerms.filter((word) => words.includes(word)).length;
  const ranked = sentences
    .map((sentence, index) => ({ ...sentence, index, score: score(sentence.terms) }))
    .sort((a, b) => b.score - a.score || a.start - b.start);
  const windows: Array<{
    start: number;
    end: number;
    relevance: number;
    cut: boolean;
    boundaryTruncated: boolean;
  }> = [];
  if (text.length <= 4000)
    windows.push({
      start: 0,
      end: text.length,
      relevance: score(terms(text)),
      cut: false,
      boundaryTruncated: false,
    });
  else
    for (const hit of ranked) {
      if (windows.length >= 3) break;
      // Include both immediate neighboring sentences; distant context is explicitly missing.
      let start = sentences[Math.max(0, hit.index - 1)]!.start;
      let end = sentences[Math.min(sentences.length - 1, hit.index + 1)]!.end;
      let boundaryTruncated = false;
      if (end - start > 4000) {
        boundaryTruncated = true;
        // A giant paragraph may contain a late hit; anchor its first relevant term.
        const normalizedHit = text.slice(hit.start, hit.end);
        const anchor = [...normalizedHit.matchAll(/[\p{L}\p{N}\u064b-\u065f]+/gu)].find((match) =>
          terms(match[0]).some((word) => queryTerms.includes(word)),
        );
        const center = hit.start + (anchor?.index ?? 0);
        start = Math.max(0, center - 1800);
        end = Math.min(text.length, start + 4000);
        if (!utf16Boundary(text, start)) start--;
        if (!utf16Boundary(text, end)) end--;
        if (end - start > 4000) {
          end = start + 4000;
          if (!utf16Boundary(text, end)) end--;
        }
      }
      if (windows.some((row) => start < row.end && end > row.start)) continue;
      windows.push({
        start,
        end,
        relevance: hit.score,
        cut: start > 0 || end < text.length,
        boundaryTruncated,
      });
    }
  const lexical: EvidencePassageView[] = windows.map((row) => ({
    passageId: `passage-${sha256(canonical([source.snapshotKey, source.originalSha256, row.start, row.end])).slice(0, 24)}`,
    evidenceKey: source.snapshotKey,
    originalSha256: source.originalSha256,
    startOffset: row.start,
    endOffset: row.end,
    offsetUnit: 'utf16_code_unit',
    originalText: text.slice(row.start, row.end),
    contextTruncated: row.cut,
    boundaryTruncated: row.boundaryTruncated,
    relevance: row.relevance,
  }));
  return [
    ...preferred,
    ...lexical.filter(
      (p) => !preferred.some((h) => h.startOffset < p.endOffset && h.endOffset > p.startOffset),
    ),
  ].slice(0, 3);
}

export function assessorEvidence(
  source: SourceEvidence,
  query: string,
  preferences?: readonly CachePassagePreference[],
) {
  const {
    originalText: _originalText,
    provenance: _provenance,
    delivery: _delivery,
    retrievalModes: _retrievalModes,
    ...identity
  } = source;
  const passages = evidencePassages(source, query, preferences);
  return {
    ...identity,
    evidenceKey: source.snapshotKey,
    passages,
  };
}

/** Durable trace keeps restorable offsets/hashes, without copying passage text. */
export function passageTrace(
  source: SourceEvidence,
  query: string,
  preferences?: readonly CachePassagePreference[],
) {
  return evidencePassages(source, query, preferences).map(({ originalText, ...row }) => ({
    ...row,
    excerptSha256: sha256(originalText),
  }));
}
