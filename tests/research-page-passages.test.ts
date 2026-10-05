import { expect, it } from 'vitest';
import {
  cachePassages,
  passageHint,
  preferredCachePassages,
  bindCachePassageHits,
  cachePassagePreference,
  validateCachePassagePreferences,
} from '../apps/api/src/research-page-passages.js';
import { evidencePassages } from '../apps/api/src/semantic-spans.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
import type { SemanticClaim } from '../packages/contracts/src/semantic-assessment.js';
const source = (text: string) =>
  ({
    snapshotKey: 'web-cache:owned',
    originalText: text,
    originalSha256: sha256(text),
    provenance: {},
  }) as SourceEvidence;

it('rejects claim/source/query rebinding and duplicate preferences', () => {
  const s = source('حفظ الحقوق مطلوب إلا إذا تعذر ذلك.');
  const claim = {
    id: 'claim-' + 'a'.repeat(24),
    originalText: 'حفظ الحقوق مطلوب.',
    evidenceKeys: [s.snapshotKey],
  } as SemanticClaim;
  s.provenance.cachePassageHits = [passageHint(cachePassages(s).passages[0]!)];
  s.provenance.cachePassageQuerySha256 = sha256(claim.originalText);
  const bound = bindCachePassageHits(s, claim.originalText, claim.originalText),
    p = cachePassagePreference(bound, claim)!;
  expect(validateCachePassagePreferences([p], [claim], [s])).toEqual([p]);
  for (const bad of [
    { ...p, claimId: 'claim-' + 'b'.repeat(24) },
    { ...p, querySha256: '0'.repeat(64) },
    { ...p, originalSha256: '0'.repeat(64) },
    { ...p, evidenceKey: 'different' },
    { ...p, coverage: { ...p.coverage, coveredUtf16Units: 1 } },
    { ...p, hits: [{ ...p.hits[0]!, endOffset: 1 }] },
  ])
    expect(() => validateCachePassagePreferences([bad], [claim], [s])).toThrow();
  expect(() => validateCachePassagePreferences([p, p], [claim], [s])).toThrow();
  expect(() =>
    validateCachePassagePreferences([p], [{ ...claim, evidenceKeys: [] }], [s]),
  ).toThrow();
});
it('partitions unchanged originals deterministically with UTF16/codepoint/hash bindings and bounded exact context', () => {
  const s = source('نص عربي 😀 مع شرط إذا تحقق الأمر فلا يتجاوز القيد.\n'.repeat(450));
  const a = cachePassages(s);
  expect(cachePassages(s)).toEqual(a);
  expect(a.coverage.fullTextIndexed).toBe(true);
  expect(a.coverage.coveredUtf16Units).toBe(s.originalText.length);
  expect(a.passages.length).toBeLessThanOrEqual(32);
  let cursor = 0;
  for (const p of a.passages) {
    expect(p.coreStart).toBe(cursor);
    cursor = p.coreEnd;
    expect(p.originalText).toBe(s.originalText.slice(p.startOffset, p.endOffset));
    expect(Array.from(s.originalText).slice(p.codePointStart, p.codePointEnd).join('')).toBe(
      p.originalText,
    );
    expect(p.passageSha256).toBe(sha256(p.originalText));
    expect(p.originalText.length).toBeLessThanOrEqual(3000);
    expect(p.originalText).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
  }
});
it('flags a cut giant sentence and cannot present it as an intact qualifier unit', () => {
  const s = source('مطول😀'.repeat(450) + ' إلا إذا تحقق الشرط الأخير.');
  const a = cachePassages(s);
  expect(a.coverage.fullTextIndexed).toBe(true);
  expect(a.passages.every((p) => p.boundaryTruncated)).toBe(true);
  s.provenance.cachePassageHits = [passageHint(a.passages[0]!)];
  s.provenance.cachePassageQuerySha256 = sha256('مطول');
  expect(evidencePassages(s, 'مطول')[0]!.boundaryTruncated).toBe(true);
});
it('delivers a verified middle-page dense hit even when lexical query terms favor only the page head', () => {
  const s = source(
    'عنوان التفاعل الاجتماعي.\n' +
      'تمهيد عام غير متعلق بالمراد.\n'.repeat(150) +
      'يجب حفظ العهد إلا إذا استحال تنفيذه.\n' +
      'خاتمة عامة غير متعلقة.\n'.repeat(150),
  );
  const p = cachePassages(s).passages.find((p) => p.originalText.includes('حفظ العهد'))!;
  s.provenance.cachePassageHits = [passageHint(p)];
  s.provenance.cachePassageQuerySha256 = sha256('التفاعل الاجتماعي');
  expect(evidencePassages(s, 'التفاعل الاجتماعي')[0]!.originalText).toContain('حفظ العهد إلا إذا');
  expect(preferredCachePassages(s)[0]!.startOffset).toBe(p.startOffset);
});
it('rejects stale, fabricated, malformed or rebound preferred offsets rather than trusting metadata', () => {
  const s = source('حفظ الحقوق مطلوب إلا إذا تعذر ذلك.');
  const hint = passageHint(cachePassages(s).passages[0]!);
  for (const h of [
    { ...hint, originalSha256: '0'.repeat(64) },
    { ...hint, startOffset: 1 },
    { ...hint, passageSha256: '0'.repeat(64) },
    { ...hint, chunkerVersion: 'unknown' },
  ]) {
    s.provenance.cachePassageHits = [h];
    s.provenance.cachePassageQuerySha256 = sha256('الحقوق');
    expect(() => evidencePassages(s, 'الحقوق')).toThrow();
  }
  s.provenance.cachePassageHits = [hint];
  s.originalText += ' تعديل';
  expect(() => cachePassages(s)).toThrow('CACHE_PASSAGE_PARENT_INVALID');
});
