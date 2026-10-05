import { expect, it } from 'vitest';
import { compactDraftPreview } from './text-preview.js';

it('keeps short original Arabic, whitespace and literal markup unchanged', () => {
  const text = '  قَالَ الكاتب 😀 <img src=x>\n';
  expect(compactDraftPreview(text)).toBe(text);
});

it('bounds long excerpts without splitting emoji or Arabic combining clusters', () => {
  expect(compactDraftPreview(`${'ن'.repeat(159)}😀 ذيل`)).toBe(`${'ن'.repeat(159)}…`);
  expect(compactDraftPreview(`${'ن'.repeat(159)}قَ ذيل`)).toBe(`${'ن'.repeat(159)}…`);
  expect(compactDraftPreview('ن'.repeat(3000)).length).toBe(161);
});
