# Reviewer workflow staging runbook

Issue [#156](https://github.com/smaq777/Basira-Hackathon/issues/156), 6 October 2026.
The implementation is merged into `development` through PRs #159 and #160 and
deployed on Railway staging. Health/readiness and selected live Arabic comparisons
are verified; **full workflow acceptance is still pending**. See the
[dated acceptance checkpoint](../evidence/2026-10-06-reviewer-staging-checkpoint.md)
for completed checks and remaining publication, email and RAG tests. Vercel, main
and production are excluded from this delivery.

## Review, publication and source approval

- Keep the submitted revision and AI report immutable. Reviewers edit a separate
  report containing quotation, analysis, classification and context records.
- The UI publishes directly; it has no draft-save action. A confirmation makes
  publication deliberate. Each later update appends a version. The expected
  version prevents an old tab from overwriting a newer publication.
- Resolved records require a nonempty reviewed phrase, reason and linked evidence.
  Suggested human wording requires at least one resolved evidence-linked record.
  This is human editorial authority, not automatic scholarly endorsement.
- The secure ticket/email lookup shows the latest published human report. It
  never exposes unpublished historical responses or a mismatched email pair.
- Source edits in a report do not change the retrieval corpus. Separate source
  approval requires a published version, a resolved linked record, source author,
  edition, HTTPS reference and rights record, plus explicit curator confirmation.
- Source curation defaults to the `CLERK_REVIEWER_USER_IDS` allowlist. For the
  owner-authorized hackathon test, `REVIEWER_CORPUS_ACCESS_MODE=authenticated`
  lets any authenticated reviewer curate on Railway staging only. Anonymous
  writes remain denied. Unknown/production environments reject this mode;
  `NODE_ENV=production` alone does not identify Railway's deployment environment.
- `REVIEWER_CORPUS_DATABASE_URL` is a separate curator login on the same corpus
  database/endpoint as `FOUNDATION_CORPUS_DATABASE_URL`; the read connection is
  never reused for writes. The curator receives only schema usage and the scoped
  approval function, with no runtime/research role membership or table writes.
  Provision the new role using `scripts/sql/reviewer-corpus-role.sql`, supplying
  its settings as transaction-local parameters. Do not rotate or alter an
  existing login to make this feature work. Missing or unsafe credentials disable
  source publication honestly while ordinary analysis/review remains available.
- Approved original hadith/book/scholar excerpts use an immutable content-derived
  identity, preserving original text separately from search normalization. They
  become members of the configured corpus for lexical retrieval. No automatic
  embedding backfill is claimed. This editor cannot replace canonical Quran text
  or automatically insert tafsir rows.
- A revoked edition cannot be revived by this source-approval operation. A
  report-database audit failure after corpus insertion returns an honest partial
  receipt. Retry the identical approved source to finish the audit, not to change
  the original or create duplicates.

## Email evidence and recovery

Initial receipt and reviewed-report messages are branded Arabic RTL HTML with
escaped user/reviewer content and a secure ticket lookup link. Contact values
remain encrypted; the link contains no email address or ownership secret.

Migration `0018_email_delivery_receipts.sql` records Brevo's message ID separately
from the outbox status. The worker polls bounded message-specific transport events
using the [Brevo event API](https://developers.brevo.com/reference/get-email-event-report).
The status meanings are:

| State                              | Meaning                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| Pending / sending                  | Application queue or current send attempt; not delivery              |
| Accepted                           | Brevo returned a message ID; receiving server acceptance unproven    |
| Delivered                          | Provider reports receiving-server delivery; inbox placement unproven |
| Deferred                           | Provider reports delayed delivery                                    |
| Bounce / blocked / invalid / error | Provider failure; do not silently resend                             |
| Unknown send result                | Interrupted send or unverified receipt; investigate first            |

Delivery polling checks at most ten receipts per worker cycle, no more often than
five minutes per receipt, for seven days. Polling failures never resubmit mail.
Only provider message ID, transport event and time are retained; no raw event
payload, contact address, IP or provider reason is persisted in this table.

Brevo idempotency keys are an additional short-lived guard, not permanent exactly-once
delivery. Only explicit HTTP 429 responses receive automatic bounded retries.
Network/5xx/unknown acceptance, failed acceptance audit and sending leases older
than ten minutes are stopped for reconciliation; blindly retrying them can send
duplicates. Inspect the provider logs before any owner-approved resend. A receipt
already persisted prevents an outbox resend even if completion failed afterward.

Delivery to a mailbox server does **not** guarantee inbox placement. User inbox
confirmation (including spam/junk) remains part of the live acceptance test.

## Data and migration boundaries

Apply checked-in owner migrations only after isolated rehearsal and checksum/drift
checks. Runtime receives scoped function execution, not table writes or ownership.
The application never runs migrations at startup. Report and corpus connections
can belong to different databases, so rehearse and inspect both explicitly.

`scripts/rehearse-reviewer-migrations.mjs` creates only explicitly named
`basirah_qa_156_*` databases on the explicit Railway staging PostgreSQL target.
The shaped mode copies schema and grants, **not beneficiary/contact rows**.
Synthetic test changes roll back. Existing compatible cluster roles use the frozen
`existing-roles-v1` profile; their grants and attributes are not changed.

`scripts/rehearse-neon-reviewer.mjs` accepts an explicit expiring `codex-156-*`
child, expected parent and direct endpoint. It validates every recorded migration
checksum, applies only missing checked-in migrations, and verifies the existing
reader remains unable to approve sources. A newly created temporary curator login
exercises scoped approval, idempotency, null-provenance rejection and direct-write
denial, then is removed. Synthetic rows roll back and original passage counts must
remain unchanged. This does not switch `.env`, link the workspace or migrate the
shared staging corpus.

`scripts/rollout-reviewer-staging.mjs inspect` validates the explicit Railway
project/service/environment identities, the API-to-report database binding and
the API-to-Neon child/endpoint binding. It checks every recorded checksum before
planning any change. `apply` executes only missing checked-in migrations on those
same staging targets and verifies that the corpus passage count and immutable
content-hash identities are unchanged. It does not provision or elevate roles,
write local environment files, reset data or deploy an application. Inspect first;
use this only after the isolated rehearsals and owner-authorized rollout.

`scripts/provision-reviewer-staging.mjs` uses the same explicit API/environment
and Neon child binding, then creates only the dedicated source-approval login.
It verifies privileges through catalog OIDs, so verification does not require
granting access to the underlying source schema. The credential is generated in
memory and sent through stdin to the private Railway variable with deploys
skipped. The reader connection is compared before/after and never replaced.
It also sets staging's owner-authorized authenticated curation mode. Existing
configured credentials are never overwritten. The explicit recovery option is
only for this task's new, unconfigured role after an interrupted provisioning;
it checks the role's restricted attributes and absence of memberships first.

Ticket removal is recoverable archival: hidden from active queue and public lookup,
with original revisions and audit preserved. It stops unclaimed email work; an
already accepted message cannot be recalled. Restore requires reviewer permission.

Forward-fix migrations and disable affected capabilities if a rollout fails. Never
reset or overwrite shared data to make a test pass. Keep isolated QA databases
until their exact cleanup is authorized.

## Verification checklist

1. Check report and corpus schema versions, checksums, approved/revoked state and
   least-privilege bindings. Verify staging authenticated curation and anonymous
   denial; retain the restricted production default.
2. Publish, reload, update and reject a stale version; inspect unchanged original
   revision and AI baseline. Test wrong-email and archived-ticket lookup denial.
3. Follow an evidence-linked source through approval receipt to later relevant
   Arabic retrieval. Include no-match and unrelated-source abstention controls.
4. Use only the owner-authorized staging test mailbox for receipt and full-report
   email. Compare the exact published version, provider ID and delivery event.
5. Inspect actual responsive reviewer/public reports and pagination/priority.
6. Record commit, PR checks, merge commit and Railway deployed SHA. Only then
   record live acceptance and give Ahmed the final handoff.

### Hosted-demo deployment pin

The hosted-demo boundary requires `BASIRAH_DEPLOYMENT_SHA` to equal Railway's
actual `RAILWAY_GIT_COMMIT_SHA`, alongside the staging service/environment and
`development` branch declarations. An automatic build immediately after a merge
can start before this explicit pin is updated and fail with
`HOSTED_DEMO_ENVIRONMENT_MISMATCH`. Preserve the boundary: update only the staging
pin to the verified merge SHA with deploys skipped, then redeploy that exact
Railway artifact. Read back the deployment SHA and successful state, then inspect
`/health` and `/ready`. Do not remove the guard, infer success from the merge, or
alter production configuration. This applies to documentation-only merges too.

The public `#/sources` page distinguishes MCP acquisition, stored attributable
snapshots, deterministic quotation comparison and provisional AI interpretation.
The altered unreferenced excerpt `وإن تخفوها وتؤتوها الفقراء فهو خير لهم`
must expose `لهم` versus source `لكم`; an accurately aligned excerpt remains an
excerpt, not automatically a fabricated whole verse.

## Bounded unreferenced Quran discovery

Live acceptance found that an unreferenced excerpt could not match when the
pinned corpus did not contain its verse. The hosted adapter now uses the existing
Tafsir MCP `search_quran_text` tool to discover locators for short Arabic-only
unquoted inputs (6–100 words, at most 700 characters). Its tool schema is pinned;
only the first six words are queried, with at most three results. More than two
distinct locators, schema drift, invalid references and provider failure abstain.
Search snippets and ranking scores are never treated as evidence. The existing
exact-source provider re-fetches canonical Quran wording, verifies its hash and
requires one unique near-exact alignment against the entire supplied excerpt.
The existing minimum consecutive-word and maximum-replacement checks remain;
ambiguity or a thematic-only neighbor is not shown as a match. No unrestricted
web search, corpus reset or fabricated reference is involved.
