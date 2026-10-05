import type { ClaimApplicability, FoundationIntake } from './foundation.js';

export const CLAIM_APPLICABILITY_VERSION = 'claim-applicability-1.0';

/** Syntactic applicability only: never establishes claim truth or evidence support. */
export function assessClaimApplicability(
  intake: Pick<FoundationIntake, 'originalText' | 'segments'>,
): ClaimApplicability {
  // Unknown/missing segmentation cannot establish that the text contains no claim.
  if (!intake.segments.length) return { status: 'undetermined', reason: 'unclear_author_text' };
  const sourceSpans = intake.segments
    .filter((segment) => segment.role !== 'author_text')
    .sort((a, b) => a.startOffset - b.startOffset);
  let cursor = 0;
  let authoredText = '';
  for (const segment of sourceSpans) {
    if (
      !Number.isInteger(segment.startOffset) ||
      !Number.isInteger(segment.endOffset) ||
      segment.startOffset < cursor ||
      segment.endOffset <= segment.startOffset ||
      intake.originalText.slice(segment.startOffset, segment.endOffset) !== segment.originalText
    ) {
      return { status: 'undetermined', reason: 'unclear_author_text' };
    }
    authoredText += intake.originalText.slice(cursor, segment.startOffset);
    const quoted =
      /[«“"{]\s*$/u.test(intake.originalText.slice(0, segment.startOffset)) &&
      /^\s*[»”"}]/u.test(intake.originalText.slice(segment.endOffset));
    if (segment.role === 'unclassified' && !quoted) authoredText += segment.originalText;
    else authoredText += ' ';
    cursor = segment.endOffset;
  }
  authoredText += intake.originalText.slice(cursor);
  const residual = authoredText
    .replace(/[\u064b-\u0652\u0670\u06d6-\u06ed]/gu, '')
    .replace(
      /(?:قال تعالى|قال الله|قوله تعالى|قال رسول الله(?: صلى الله عليه وسلم)?|قال النبي(?: صلى الله عليه وسلم)?)/gu,
      '',
    )
    .replace(/عن [\p{Script=Arabic}\s]{1,100}?(?:رضي الله عنه(?:ما)? )?قال\s*:/gu, '')
    .replace(/(?:صلى الله عليه وسلم|رضي الله عنه(?:ما)?)/gu, '')
    .replace(/[«»“”"{}()[\]:：،,\t \r]+/gu, ' ')
    .trim();
  const clauses = residual
    .split(/[؟?!\n.؛]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!clauses.length) return { status: 'not_applicable', reason: 'quotation_only' };
  const assertion =
    /(?:^|\s)(?:إذن|اذن|لذلك|بالتالي|وعليه|يدل|يثبت|دليل على|هذا يعني|يجب|يحرم|واجب(?:ة|ا)?|حلال|حرام|غير واجب(?:ة)?|ليس واجبا|لا يجب)(?:\s|$)/u;
  if (clauses.some((clause) => assertion.test(clause))) {
    return { status: 'applicable', reason: 'assertion_present' };
  }
  // Only a bounded request for a definition/explanation is confidently a question.
  // A question with an asserted premise or an extra declarative clause abstains.
  const plainQuestion =
    /^(?:ما معنى|ما هو|ما هي|ما أنواع|ما انواع|ما المقصود ب|هل|كيف|متى|أين|اين)\s/u;
  if (
    /[؟?]/u.test(residual) &&
    clauses.length &&
    clauses.every((clause) => plainQuestion.test(clause))
  ) {
    return { status: 'not_applicable', reason: 'question_and_quotations_only' };
  }
  return { status: 'undetermined', reason: 'unclear_author_text' };
}
