# Post-intake ticket communication evidence

Related to #202. Implementation and isolated validation, 6 October 2026.

## Findings and change

The previous outbox queued published responses only, while archive cancelled
pending mail and the worker rejected closed tickets. A read-only aggregate of
staging's last 24 hours found one failed review notification with
`BREVO_HTTP_400`; staging was on migration 0018. No contact, message content or
credential was retrieved. The old idempotency key was not a UUID, contrary to
[Brevo's documented contract](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).
This is a demonstrated contract defect, not proof of the precise HTTP 400 reason.

Forward migration 0019 queues generic progress, closure, reopening and source-status
notices alongside exact-version published response emails. Contact confirmation
retains its receipt path. Notice creation is atomic with ticket audit events,
consent-gated and excludes transport events. Draft notes/reports remain private.
Closing a ticket preserves pending communications. Repeated close/reopen/source
receipt operations are idempotent. Mail uses the existing durable outbox UUID;
provider acceptance, delivery and ambiguous outcomes retain their prior meanings.

## Isolated database evidence

Final migration/UUID revision passed both fresh full-chain and staging-schema-only
rehearsals on explicitly selected staging PostgreSQL, in isolated databases
`basirah_qa_202_fresh_1006b` and `basirah_qa_202_shaped_1006b`. Synthetic ticket
transactions rolled back; the shared staging database was not migrated.
Earlier `1006a` databases retain pre-UUID-refinement rehearsal checkpoints.

Both final probes returned:

> PASS: ticket event communications, exact versions, consent, closure/reopen, no draft disclosure, no audit loops, no blind resend and runtime isolation

Controls exercised two published versions with independent content, queued
progress without draft disclosure, closed-ticket delivery claims, one source
status notice despite a repeated receipt, idempotent closure/reopen, no opt-out
jobs, revocation before claim, old-worker compatibility, provider acceptance
readback, no send-result-unknown retry, and denied direct runtime outbox writes.

## Application validation and release boundary

Focused tests cover mail rendering, stable UUID reuse, distinct job UUIDs,
exact response/report binding, closed-ticket dispatch, revoked consent, and API
notification wakeups after authorized successful mutations. The complete Node 24 `npm run check` passed: 1111 tests passed, one skipped,
plus type checking, documentation/policy/format checks and the production build.
CI results are recorded on issue #202 and its linked pull request.

No live test message, historical resend, shared-database migration, merge,
deployment or mailbox delivery acceptance is claimed. Owner acceptance and a
scoped staging release/mailbox test remain required. Roll back application code
through a reviewed PR; preserve the additive schema and receipts. Never retry
ambiguous historical sends automatically.
