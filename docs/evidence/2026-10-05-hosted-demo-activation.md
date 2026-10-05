# Hosted staging Foundation activation

Issue #114 records the owner-requested repair of the shared Railway staging flow.
This is operational evidence for a research-only demo, not source approval,
production activation, or a correctness claim.

## Selected deployment

- Railway project: `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`.
- Environment: `staging` (`97179b92-48b1-412f-95ff-1901bb826458`).
- API service: `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`.
- Source branch and revision: `development` at
  `2f8436e58b231852caf28d892826605a76e33059`.
- Public origin: `https://api-staging-42bc.up.railway.app`.

The service was configured for the existing bounded `FOUNDATION_HOSTED_DEMO`
mode. It uses the separate Railway report database and worker login, the pinned
read-only Neon corpus, and OpenRouter semantic assessment. Live Tafsir, web
discovery, cache writing, source cleaning and rewrite features remain disabled.
No credential is stored in this evidence or in Git.

## Database verification

The Railway report database returned ready at migration
`0014_direct_review_ticket_intake`. The original staging connection was only the
guest/runtime login; a separate `basirah_worker_staging` login was created and
granted only the existing `basirah_worker` capability.

The selected Neon passage-index branch was queried through the existing
`basirah_corpus_reader` login after entering `basirah_research_runtime` in a
read-only transaction. The selected `basirah_research` database contained:

- 17 source editions, all `pending`;
- 86 passages in corpus version
  `794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`;
- 86 compatible `openai/text-embedding-3-small` document embeddings for that
  version;
- 30 typed passage relations;
- 149 total version memberships and embeddings across the retained 86-, 62- and
  one-passage replay versions.

These counts establish a real reusable research corpus. They do not establish
coverage, scholarly approval, publication rights, or production readiness.

## Failure and correction

The first live request, review `575b01e5-cd66-4ed0-b964-19fe3ae1ea0e`, remained
queued until its deadline. PostgreSQL 18 recorded the worker membership with
`inherit_option=false` because the login had initially been created as
`NOINHERIT`; consequently the polling worker could not execute the queue
functions. The login was changed to `INHERIT`, and the membership was re-granted
with explicit `INHERIT TRUE, SET TRUE`. A negative-ID call then confirmed that
`basirah_api.acquire_review` was callable and returned no lease.

## Fresh end-to-end result

After that correction, a new public example moved through document and revision
persistence, automatic review creation, worker acquisition, OpenRouter claim
assessment, Neon retrieval and durable report rendering. Review
`33c586c0-1722-4e9a-94d4-3340c1f91e75` rendered a partial report in the staging
browser in about 30 seconds. It showed one provisional claim assessment and 16
candidate source/context rows. The public capabilities endpoint reported
`foundationReview=true`, `hostedFoundationDemo=true`,
`provisionalSemanticAssessment=true`, and `liveProviders=["openrouter"]`.

The result also exposed material quality limits. Hosted-demo intake does not
provide the canonical local quotation index, so the example Quran quotation was
not compared literally. Hybrid retrieval returned topically weak candidates,
including a Tawhid source for a charity claim. The UI correctly retained a
partial/research label and did not present the result as scholarly approval.
Production must remain disabled until source approval and retrieval calibration
are completed.

Rollback is to set `FOUNDATION_ENABLED=false` in the selected staging service.
That stops paid processing without deleting reports or changing the immutable
Neon corpus.
