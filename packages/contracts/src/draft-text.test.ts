import { expect, it } from 'vitest';
import { isSafeDraftText, MAX_DRAFT_LENGTH } from './draft-text.js';

it('preserves valid Arabic typography, emoji and literal markup', () => {
  expect(MAX_DRAFT_LENGTH).toBe(3000);
  expect(isSafeDraftText('  ﴿نَصٌّ﴾ ﷺ اللّٰه\n\t🙂 👩‍💻 <script>alert(1)</script> & " \'')).toBe(
    true,
  );
});

it.each(['\u0000', '\u0007', '\u001b', '\u007f', '\u0085', '\ud800', '\udc00'])(
  'rejects malformed Unicode or unsupported transport control %j',
  (control) => {
    expect(isSafeDraftText('قبل' + control + 'بعد')).toBe(false);
  },
);
