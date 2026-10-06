# Reviewer source controls and persistence diagnostics

Issue [#191](https://github.com/smaq777/Basira-Hackathon/issues/191), 6 October 2026.

## Observed staging causes

The selected published ticket has email follow-up disabled, no encrypted contact,
no notification outbox entry, no provider delivery receipt and no RAG publication
receipt. Report publication did not trigger an email because consent/contact was
absent. No resend, contact change or claim of mailbox delivery was made.

Its only evidence role is `quran_text`; the quotation record is `different` and
classification/context records are `not_assessed`. The reviewer-source publisher
deliberately excludes canonical Quran and Tafsir. A corrected human report does
not replace the canonical source, and reviewer notes are not retrieval evidence.

The staging curator variable exists, but the unchanged binding validator returns
`REVIEWER_CORPUS_DEDICATED_CONNECTION_REQUIRED`. The active corpus reader and the
configured curator do not satisfy the same-target/distinct-login requirement.
The writer remains unavailable. No URL, credential, grant, role, corpus member,
embedding or migration was changed to bypass this guard.

## Implemented controls

- The protected ticket endpoint reports `sourcePublicationAvailable` for the
  authenticated reviewer using the existing initialized-writer and access gates.
- UI and API share the same resolved-record/provenance eligibility checks.
  Only linked, resolved hadith/book/scholar originals with author, edition and
  HTTPS provenance can be selected. Rights and confirmation remain separate.
- Full-width labelled RTL select/textarea controls use existing site styling.
  Unpublished, empty, unavailable and busy states disable writes and explain why.
  Stale selection/confirmation is cleared on ticket reload.
- Empty notification status distinguishes absent email consent from absent
  outbox work; neither is labelled delivered.

Targeted synthetic frontend/API/curator/email tests passed (22 tests). Node 24
validation passed 1,082 tests with one existing skip across 77 files, typecheck,
policy, formatting and builds. Documentation links passed across 118 files;
Python Foundation validation passed 51 tests. Actual CI/merge/deployment receipts
must be recorded on the issue; these tests do not establish live source
publication or subsequent corpus retrieval.

## Read-only missing-report control

The actual running API's `DATABASE_URL` was matched privately to Railway report
service `a971b1ae-6d14-4389-9195-a51b672d3a70`, not Neon. Database: `railway`;
application login: `basirah_app_staging`; existing diagnostic role: `postgres`.
The diagnostic role bypasses RLS; the application login does not. RLS is enabled
on all five queried ownership/report tables and was not disabled.
Actual runtime `GUEST_RETENTION_HOURS` is `24`; source/pin match
`b0f8852190fe63d9b21a88c70fcb143952c74c44` at this diagnostic checkpoint.

| Record                                 | Run/report/document/session chain                                       |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `99b54f18-7c9b-4a1b-b5c3-1bbf8e31f7e2` | All exist; session unexpired and not deleted                            |
| `3c15330c-9d6d-42ea-ae5b-b390d0138480` | Run absent; no linked report or surviving chain; timestamps unavailable |

Working control timestamps, UTC:

- Session created: `2026-10-05T20:24:07.227516Z`.
- Session expires: `2026-10-06T20:24:07.227517Z`.
- Document created: `2026-10-06T15:59:42.105180Z`.
- Revision created: `2026-10-06T15:59:42.106484Z`.
- Run created: `2026-10-06T15:59:42.876101Z`.
- Report created: `2026-10-06T15:59:59.801009Z`.

Both explicit guest-session deletion and expired-session cleanup cascade to
documents, revisions, runs and reports. Cleanup runs before guest-session creation.
The missing chain alone cannot distinguish these causes or reconstruct its old
expiry. No deletion audit or historical database-target change was proved by this
bounded check. Cookie presence/HTTP failure were not inferred from SQL. Preserve
the original failure and investigate the creation/deletion timeline separately.

## Ahmed handoff / remaining acceptance

The source function writes `source_edition`, immutable `passage`,
`corpus_snapshot` membership and `reviewer_source_contribution` in the corpus
database. A separate `reviewed_source_receipt` binds report version and source
identity in the report database. It does not store user notes as source text or
automatically create embeddings. The existing synthetic tests cover API gates,
idempotent arguments and original-wording preservation; they are not deployed
database/retrieval proof.

Restore the deferred curator only through separately authorized same-target,
dedicated least-privilege provisioning and isolated transaction-rollback tests.
Do not modify the frozen 175-passage submission snapshot just to obtain a green
publication test. After an explicitly approved corpus release, prove the exact
published source identity is retrievable and unrelated queries abstain. Keep the
publication/retrieval blocker visible until these checks pass.
