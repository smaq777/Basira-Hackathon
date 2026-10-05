# Guest capacity feedback — 5 October 2026

Related to [issue #79](https://github.com/smaq777/Basira-Hackathon/issues/79). This stacked implementation starts from issue #17's frozen `53c757f` and depends on [draft PR #92](https://github.com/smaq777/Basira-Hackathon/pull/92) and its reviewed cleaning dependency. It changes client handling and presentation only; server limits, authentication, ownership, existing reports and provider behavior remain unchanged.

## Problem and behavior

A prior owned local test session had twenty documents and could view existing reports but could not create another draft. The database guard returns HTTP 429 `RESOURCE_LIMIT_REACHED` with a `documents`, `revisions` or `reviews` resource. The client discarded that field and presented a connection failure with retry. The original UI response payload was not captured; the prior session count and code path are evidence of capacity, not a reconstructed request receipt.

The client now retains only those three documented resource values on a confirmed 429 capacity response. The Arabic notice explains whether the session's drafts, a draft's saved versions, or a revision's reviews reached capacity. Unknown resource values receive a generic capacity notice without exposing the supplied value. The screen offers return to the unchanged text and does not suggest repeating a fixed-capacity request, replacing the ownership cookie, deleting drafts or raising quotas. Previous reports remain owned by the same session.

A confirmed capacity rejection of review creation clears only its rejected pending creation promise, so returning to the draft does not attempt to cancel a nonexistent review. Existing runs and ambiguous transport failures retain the cancellation path. Where a saved revision already exists, the existing human-review action remains available; capacity feedback does not submit a human ticket automatically.

Burst HTTP 429 `RATE_LIMITED` remains distinct: it asks the user to wait and preserves the explicit retry button. Network/timeouts and other transient failures retain existing retry handling. No automatic resubmission or session reset is added.

## Validation and limits

Offline client and full React flow tests cover all three known resources and an unknown value, exact leading/trailing draft whitespace, no fabricated report, no session replacement, no silent document/review resubmission, safe return after review-cap rejection and retained explicit retry for burst failures. API guard behavior is unchanged. These mocked responses prove client behavior, not a newly reproduced real database quota or production service availability. A live isolated UI capacity recheck remains a separate lead validation task; no paid models are needed.

Rollback reverts the presentation/client additions while retaining all server protections and stored ownership. No migration, environment edit, source/corpus mutation or deployment is part of this change. Acceptance and issue closure remain with Saleh.
