/** The review contract counts UTF-16 units, matching stored source spans. */
export const MAX_DRAFT_LENGTH = 3_000;

/** Preserve Arabic marks, emoji and literal markup; reject invalid transport text. */
export function isSafeDraftText(text: string): boolean {
  // Unicode mode matches lone surrogates, not the paired units of valid emoji.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u.test(text);
}
