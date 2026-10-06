import {
  reviewedAnswerText,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';

export function reviewedAnswerSource(input: {
  ticketCode: string;
  version: number;
  actor: string;
  text: string;
  review: EditorialReview;
  publicAppUrl: string;
}): EditorialReview['evidence'][number] {
  const url = new URL(input.publicAppUrl);
  if (url.protocol !== 'https:') throw new Error('REVIEWED_ANSWER_ORIGIN_REQUIRED');
  url.hash = `/reviewer/detail?ticketCode=${encodeURIComponent(input.ticketCode)}`;
  return {
    id: 'reviewer-answer',
    work: 'إجابة مراجع بصيرة',
    author: input.actor,
    edition: `نسخة المراجعة ${input.version}`,
    reference: `${input.ticketCode} — نسخة ${input.version}`,
    sourceUrl: url.toString(),
    originalText: reviewedAnswerText(input.text, input.review),
    context: '',
    sourceRole: 'reviewer_commentary',
  };
}
