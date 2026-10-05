/** Display-only excerpt. Never change the submitted or stored original. */
export function compactDraftPreview(text: string, limit = 160): string {
  if (text.length <= limit) return text;
  let end = 0;
  for (const part of new Intl.Segmenter('ar', { granularity: 'grapheme' }).segment(text)) {
    const next = part.index + part.segment.length;
    if (next > limit) break;
    end = next;
  }
  return `${text.slice(0, end)}…`;
}
