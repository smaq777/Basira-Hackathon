# Guest capacity feedback — 5 October 2026

Related to [issue #79](https://github.com/smaq777/Basira-Hackathon/issues/79). This stacked implementation starts from issue #17's frozen `53c757f` and depends on [draft PR #92](https://github.com/smaq777/Basira-Hackathon/pull/92) and its reviewed cleaning dependency. Owner development `845d608` (PR #91) is preserve-merged: unavailable Foundation analysis with a saved revision still routes to its saved result/human-review path; fixed resource capacity remains a separate notice. It changes client handling and presentation only; server limits, authentication, ownership, existing reports and provider behavior remain unchanged.

## Problem and behavior

A prior owned local test session had twenty documents and could view existing reports but could not create another draft. The database guard returns HTTP 429 `RESOURCE_LIMIT_REACHED` with a `documents`, `revisions` or `reviews` resource. The client discarded that field and presented a connection failure with retry. The original UI response payload was not captured; the prior session count and code path are evidence of capacity, not a reconstructed request receipt.

The client now retains only those three documented resource values on a confirmed 429 capacity response. The Arabic notice explains whether the session's drafts, a draft's saved versions, or a revision's reviews reached capacity. Unknown resource values receive a generic capacity notice without exposing the supplied value. The screen offers return to the unchanged text and does not suggest repeating a fixed-capacity request, replacing the ownership cookie, deleting drafts or raising quotas. Previous reports remain owned by the same session.

A confirmed capacity rejection of review creation clears only its rejected pending creation promise, so returning to the draft does not attempt to cancel a nonexistent review. Existing runs and ambiguous transport failures retain the cancellation path. Where a saved revision already exists, the existing human-review action remains available; capacity feedback does not submit a human ticket automatically.

Burst HTTP 429 `RATE_LIMITED` remains distinct: it asks the user to wait and preserves the explicit retry button. Network/timeouts and other transient failures retain existing retry handling. No automatic resubmission or session reset is added.

## Validation and limits

Offline client and full React flow tests cover all three known resources and an unknown value, exact leading/trailing draft whitespace, no fabricated report, no session replacement, no silent document/review resubmission, safe return after review-cap rejection and retained explicit retry for burst failures. API guard behavior is unchanged. These mocked responses prove client behavior; the real document-quota recheck below is separate evidence. Revision/review capacity and burst handling remain offline controls.

The lead's actual UI recheck used frozen source `a84ec9c` on `localhost:8774`,
the local report database and a public synthetic draft. Foundation/providers,
Neon/cache, tickets and mail were disabled; owning configuration and shared
services were unchanged. The existing session and its two earlier reports were
retained. At twenty documents, the next UI submission displayed `بلغت حد السعة`
with document-specific explanation and return-to-text action, without a retry
button. Returning restored the exact submitted text. No quota increase, cookie
replacement, deletion or automatic resubmission was used.

Read-only owned-session counts after the denied attempt were twenty documents /
twenty revisions / eighteen synthetic revisions, with review and report counts
both still two. Several batched browser observations timed out earlier; those
observations remain retained. Keyboard submission completed the observed flow
without restarting the app or resetting the session. This proves the selected
local document-quota recovery, not hosted availability or other quotas.

External evidence lives in `AI_Foundation/experiments/capacity-feedback-2026-10-05`:
`LIVE_UI_PROTOCOL_V1.json`, startup/baseline/after receipts, `LIVE_UI_RESULT_V1.json`,
`CAPACITY_UI_V1.jpg` and the saved-result fallback screenshot. The denied request
created no additional document above the configured twenty-document ceiling.

Rollback reverts the presentation/client additions while retaining all server protections and stored ownership. No migration, environment edit, source/corpus mutation or deployment is part of this change. Acceptance and issue closure remain with Saleh.
