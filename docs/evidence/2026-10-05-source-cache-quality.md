# Active research corpus and source-cache quality — issue #8

## Changes and scope

The integrated local Basira app now uses the 86-passage Neon research snapshot
`794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`.
This supersedes the earlier pilot's inactive snapshot status. Activation is an
explicitly authorized local testing step, separate from source approval and
Saleh's PR acceptance. Production and the shared staging deployment are unchanged.

An approved-domain, nine-topic acquisition batch collected 12 full public page
extractions. One Dorar hadith-explanation extraction contained only methodology
and reviewer navigation: its promised article was missing despite a valid title
and sufficient character count. It was quarantined before classification,
embedding or cache admission. Eleven remaining originals were classified and
embedded in the isolated Neon research cache. Current-policy visible cache rows
increased from 5 to 16; exact text/hash restoration passed for all 11 additions.
No original was rewritten, and no source approval or schema changed.

The new shared guard rejects this confirmed reviewer-only pattern on Dorar's
`/hadith/sharh/<number>` article URLs in both Tinyfish and Firecrawl acquisition.
Cache admission applies the same check; search and restoration filter old
matching rows without deleting history or suppressing valid neighboring rows.
An article with the same reviewer footer remains eligible. The guard inspects a
separate normalized view; original text and its SHA256 remain unchanged.

This is a narrow regression repair, not a proof of completeness for arbitrary
pages. Other incomplete extractions still require improved acquisition and
content review. Source allowlisting and machine topic labels are not scholarly
approval, an edition fidelity guarantee, or a rights clearance.

## Observed verification

- Integrated app UI on port 8771 completed a new 31:15 parents/obedience review.
  The faithful partial Quran quotation was not treated as an incomplete-quote
  error; the compound claim received a provisional supported assessment.
- A read-only durable-report check verified the activated 86-passage corpus
  version, one hybrid retrieval query and 14 evidence sources. This verifies
  actual app use, not only an environment-file setting.
- The 11 cache admissions/restorations preserved full originals and hashes.
  Proposed multi-label totals were aqidah 2, worship 5, ethics 2, family 1,
  transactions 1, Quran exegesis 1, hadith studies 4 and biography 1. No page was
  classified as `other`. These overlapping counts are not balanced topic
  coverage or independent corroboration.
- The focused guard/provider/cache suite passed 54 offline tests and TypeScript
  checking. It includes rejection before any classifier/database call, both
  provider paths, legacy cache filtering and preservation of article-plus-footer.
- The full suite passed 572 tests, typecheck, docs, policy, formatting and build.
  The old checkout's unchanged CRLF files first prevented formatting; applying
  the repository's existing LF policy produced no Git diff and allowed the
  complete check to pass. An initial sandbox worker-spawn failure was retried
  with authorized local execution; neither failure was an application result.
- A new source-free hadith-studies assertion in the actual UI produced
  `no_claims_extracted`: the deterministic inventory contained one substantive
  candidate, but the model selected none, so retrieval did not run. This failed
  app probe is retained and motivates the next issue #11 follow-up; cache
  admission/read-back must not be described as successful semantic use for it.

External local receipts (not committed source corpora):
`Project_Code/AI_Foundation/experiments/broader-source-cache-2026-10-05/`
contains the frozen plan, acquisition/quarantine and admission/read-back records.
`integration-lead-v1/NEON86_UI_VERIFICATION.json` and `NEON86_ACTIVE_UI.png`
record the integrated app activation check. Original page bodies and credentials
are excluded from the repository.

## Remaining acceptance and rollback

The 170-passage expansion plan is unfinished. Long cache pages still use a
bounded heading/head/tail embedding view while retaining full originals and
lexical search; this change does not implement persisted passage vectors or a
held-out retrieval benchmark. Qualified source/rights review, broader no-answer
and mixed-topic evaluation, and Saleh acceptance remain pending.

Rollback: disable optional cache/discovery flags or select the previous immutable
62-passage corpus version. Forward-fix acquisition patterns without rewriting
historical originals. Existing source approvals and production visibility remain
unchanged.
