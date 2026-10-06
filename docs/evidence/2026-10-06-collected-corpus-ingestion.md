# Collected corpus ingested into Neon

Related to [#8](https://github.com/smaq777/Basira-Hackathon/issues/8) and
[#81](https://github.com/smaq777/Basira-Hackathon/issues/81).
On 6 October 2026 (Asia/Riyadh), the user clarified: stop collecting additional
content, but ingest the eligible content already collected. The earlier stop on
embedding and ingestion is superseded for this fixed batch only.

## Actual outcome

Existing research branch `br-wandering-unit-b24xqw5d`
(`basirah-research-corpus-20261005`), project `weathered-pond-44811639`, database
`basirah_research`, now stores **175 passages and 175 embeddings** in an immutable
snapshot. Transactional ingestion returned 75 typed relations. These are source
records, not 175 books or independently reviewed cases.

New corpus version:
`7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`.
Historical 86-passage version remains:
`794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`.

The lead independently compared all 89 additions with exact retained publisher
originals in the read-only Foundation index, checking text, footnote, neighbor,
parent and relation hashes/dependencies. The 140-source prepared baseline and 86
existing vectors were preserved. Topic labels remain proposals. The 15 topic
quarantines and three additional parent-dependency quarantines were not admitted.
No new acquisition or classification occurred.

One OpenRouter call generated the 89 missing vectors with
`openai/text-embedding-3-small`, 1,536 dimensions, OpenAI only and no retries.
The response reported 15,652 input tokens and $0.00031304 cost. Originals were
embedded unchanged; summaries were not substituted. Existing vectors were reused.

## Validation and retained evidence

The existing strict manifest schema and transactional ingestor were used from
accepted development `06031c79f0857a6bd5b9bf6f7da3a74b6ec4c640`. Verified TLS,
direct endpoint/database/login guards and read-only preflight preceded ingestion.
No migrations, schema, grants, roles or approval states were changed.

Actual role-scoped readback passed after ingestion and from a fresh connection:
175 passages/175 vectors, Quran 16:91/Muyassar family restoration, nonempty
lexical/vector retrieval, and pending-source exclusion from the production reader.
Before/after fingerprints verified historical originals/vectors, migration
checksums and edition approval states unchanged. The vector probe reused a
document vector; it is technical verification, not a semantic-query quality test.

The first launcher failed before execution because a direct CommonJS `pg` import
did not expose a named `Pool` export. It made zero provider/Neon calls; the failure
was preserved and the import corrected. Successful responses were reused. There
was no provider retry or second ingestion.

Credentials-free receipts remain externally under
`AI_Foundation/experiments/collected-corpus-ingestion-2026-10-06`:
`ORIGINAL_AUDIT_V1.json`, `LAUNCH_FAILURE_V1.json`, `PREFLIGHT_V1.json`,
`EMBEDDING_RECEIPT_V1.json`, `INGESTION_RECEIPT_V1.json`,
`FRESH_READBACK_V1.json` and `LOCAL_CORPUS_PIN_V1.json`.
Prepared manifest SHA256:
`6c74a7b3e565cbe5a12c46f32b120585a40ccdcd13185e6ac61782f8b0acd9d7`.
Embedded manifest SHA256:
`c50b1369b2ae6d867a48bb1423888cfc557df46047228a41301e8de9d8f02d9d`.
Corpora, vectors and credentials are not committed to Git.

Repository validation on the accepted source recorded 811 tests passing and one
unchanged failure in `tests/foundation-activation.test.ts:116`: its hosted-demo
flag rejection expectation conflicts with the latest owner activation change.
Type checking, documentation links, policy, formatting and build passed; the
existing bundle-size warning remains. This documentation branch changes no
activation implementation or tests and does not claim a green full suite.
Saleh owns the activation correction and acceptance.

After integrating accepted owner PR137 (`f7c7028`) with a merge commit, the suite
recorded 807 passes and the same inherited activation-test failure. The task
did not change the owner's hosting code or tests. First outcomes are retained.

Latest validation: accepted owner PR139 (`caf56ff`) reconciles that test. After
preserving those owner changes with a merge commit, the full repository check
passes: 56 files / 812 tests, TypeScript, documentation links, policy, formatting
and build. Earlier failures remain in their original logs. Exact-head remote CI
and owner acceptance remain separate.

## Saleh handoff and activation

The owning ignored Foundation `.env` selects the new hash through
`BASIRAH_CORPUS_VERSION`. Credentials and other configuration remain unchanged;
no running process was restarted. Shared Vercel/Railway configuration and
deployment remain Saleh-owned and were neither changed nor polled.

For the repository API, retain the existing research database/runtime login and
compatible embedding space, and select the new hash in `FOUNDATION_CORPUS_VERSION`.
The morning submission audit corrected the previous `SOURCE_CORPUS_VERSION`
handoff typo: the repository API reads `FOUNDATION_CORPUS_VERSION`. See the
[exact staging activation steps](../operations/SUBMISSION_CORPUS_ACTIVATION.md),
including the optional `CORPUS_VERSION` consistency declaration.
Do not substitute the report database, administrative `postgres` database,
production branch or cleaning-preview child. See the
[branch inventory](../operations/NEON_BRANCH_INVENTORY.md) and
[RAG architecture](../architecture/RAG.md). A stored snapshot does not change a
deployed configuration pin.

Actual online analysis/reload/failure verification follows Saleh's accepted
staging activation. Reader checks do not establish online activation, scholarly
approval, improved claim accuracy or submission readiness. All editions remain
pending and research-only. Rollback selects the historical version; do not delete
old originals, memberships, vectors or saved reports.
