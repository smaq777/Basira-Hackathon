# Manual-review criteria verification — 6 October 2026

Issue [#177](https://github.com/smaq777/Basira-Hackathon/issues/177), based on development `30e25db`. Local implementation and offline verification; owner acceptance and deployment pending.

## Review findings and changes

The current application already derives material review reasons from quotation comparison, semantic assessment, retrieval limits, source approval and applicability. Secure ticket intake and reviewer publication already exist. The result page previously offered a generic ticket invitation without the requested explicit response wording. A selected claim missing its assessment could also escape a specific coverage reason when the assessment and overall report both said `completed`.

The change separates `not_established` from `insufficient_context`, identifies omitted selected assessments, and invites users to the existing manual-review portal with a response after review completes. Follow-up requires adding an email for secure lookup and notifications. Unconfirmed intake availability receives a clear retry message, with no submission action or response promise. Original reports, citations, assessment statuses and supported findings are preserved. No provider, database, migration, deployment or notification-send action was performed.

Product criteria are recorded in [manual review](../product/MANUAL_REVIEW.md) and linked from [requirements](../product/REQUIREMENTS.md).

## Validation

- Node `24.19.0`, npm `11.19.0`.
- Targeted report, secure ticket workflow and email delivery regressions: **78 passed in 3 files**.
- Full `npm run check`: **942 tests passed in 66 files**, typecheck, documentation links, policy, formatting and TypeScript/Vite build passed.
- `git diff --check` passed. The build retained its existing large-client-chunk advisory.
- An initial sandboxed attempt could not spawn Vitest workers (`EPERM`); the recorded passing runs used Node 24 outside that restriction.

These are software checks. The deployed capability flag, a fresh submitted ticket, reviewer turnaround and real email delivery were not verified by this change. Activation and human acceptance remain with the owner; no deadline or live specialist availability is promised.

Rollback: revert the presentation and criteria change through a reviewed PR. Existing stored tickets, reports and source data require no migration or cleanup.
