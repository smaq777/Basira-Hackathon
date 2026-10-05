/** Reject a confirmed article-missing extraction without changing its original text.
 * This narrow check is not a completeness or scholarly-fidelity guarantee.
 */
export function sourceExtractionFailure(sourceUrl: string, originalText: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null; // URL eligibility is enforced separately by the caller.
  }
  if (url.hostname !== 'dorar.net' || !/^\/hadith\/sharh\/\d+\/?$/u.test(url.pathname)) return null;
  const lines = originalText
    .split(/\r?\n/u)
    .map((line) =>
      line
        .replace(/^\s*[#*>-]+\s*/u, '')
        .replace(/\p{M}/gu, '')
        .trim(),
    )
    .filter(Boolean);
  const markers =
    /^(?:منهج العمل في الموسوعة|راجع الموسوعة|اعتمد المنهجية|بالإضافة إلى المراجعين)$/u;
  const reviewer =
    /^(?:الشيخ الدكتور [\p{Script=Arabic}\s]+|أستاذ التفسير بجامعة [\p{Script=Arabic}\s]+)$/u;
  return lines.filter((line) => markers.test(line)).length >= 2 &&
    lines.every((line) => markers.test(line) || reviewer.test(line))
    ? 'discovery_source_article_missing'
    : null;
}
