# Manual-review criteria

Related to [#177](https://github.com/smaq777/Basira-Hackathon/issues/177), with the existing ticket portal and [#113](https://github.com/smaq777/Basira-Hackathon/issues/113). These are product and presentation criteria; owner acceptance and deployment remain separate.

## Decision rule

When the available attributed sources and context cannot establish a material claim, abstain and recommend manual review. Evaluate individual findings, not only the overall `completed`, `partial` or `needs_review` label. One supported claim does not resolve another unassessed claim. Preserve each claim's status, explanation, original wording and citations.

| Condition                                                                                            | Required explanation and action                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_established`                                                                                    | The displayed evidence does not establish the claim. This is not proof that the claim is false. Invite manual review.                                     |
| `insufficient_context`                                                                               | Available evidence or material context is insufficient to assess the claim. Keep the missing-context explanation and invite manual review.                |
| Missing selected assessment, unselected claims, failed extraction or unassessed applicable inference | Identify incomplete coverage; do not treat an omitted claim as supported. Invite manual review.                                                           |
| Retrieval, source acquisition or assessment failure                                                  | Preserve usable results and identify the unavailable part. Invite manual review without implying a contradiction.                                         |
| Unresolved quotation, attribution or source identity                                                 | Identify the specific comparison or reference gap and invite manual review. Accurate quotation alone does not confirm an inference.                       |
| Explicit contradiction or wording difference                                                         | Keep the actual evidence-based finding and offer review; do not relabel it as missing sources.                                                            |
| Pending, rejected, revoked or research-only source approval                                          | Explain the source's actual state and offer review. Do not assert missing evidence solely from approval status.                                           |
| Supported claims with approved operational evidence and no unresolved material findings              | No insufficient-evidence message or required escalation. A faithful excerpt or non-applicable inference alone does not establish a claim-support failure. |

The implementation is `materialReviewReasons` in `apps/web/src/foundation-report-presentation.ts`. It derives presentation reasons without changing persisted reports or adding sources. No source-count or confidence threshold replaces claim-specific support and context checks.

## User invitation and follow-up

When the selected API explicitly confirms `reviewTickets: true`, show the reasons, the existing ticket action, and this Arabic invitation:

> يرجى استخدام المراجعة البشرية للتحقق من المواضع التي لم تُحسم. أرسل النص والنتائج المتاحة عبر تذكرة المراجعة، وسنعود إليك بالنتيجة بعد اكتمال المراجعة. أضف بريدك عند الطلب لمتابعة الرد من صفحة متابعة التذكرة واستلام إشعار البريد.

English meaning: Please use manual review for the unresolved findings. Submit the text and available results through a review ticket, and we will get back to you with the result once review is complete. Add your email when requesting review to track the response and receive an email notification.

The invitation does not itself submit a request. The receipt screen confirms submission only after the API creates the ticket. Follow-up uses the ticket code and matching saved email; email notification requires the existing contact/opt-in flow. A published reviewer response, notification queuing, provider acceptance and email delivery are separate states. Do not promise a response deadline or immediate specialist availability.

When capabilities are missing, false or unreachable, preserve the report, hide submission actions and explain that intake availability is unconfirmed. Do not promise receipt or a response to an unsent request. Users can retain their report and try later.

## App update and verification

Issue #177 separates missing context from an unsupported inference, detects selected claims omitted from an otherwise completed assessment, adds the manual-review invitation and explains unavailable intake. The existing secure portal, ownership checks, immutable reports, reviewer publication and notification workflow remain the delivery path; no schema or provider change is required.

Offline regressions cover both abstention states in completed reports, omitted selected assessments, preservation of stored findings, supported/non-applicable cases and true/false/missing capability handling. Ticket workflow and email delivery tests verify the existing follow-up path separately. Local checks do not prove a deployed service is enabled, staffed or delivering email; release verification must read the deployed capabilities and exercise an authorized ticket through publication and follow-up.
