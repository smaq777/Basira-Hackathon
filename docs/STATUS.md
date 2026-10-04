# Current delivery status

Baseline date: **3 October 2026**. See live issues and PR checks for subsequent progress.

**Local implementation update, 4 October:** Issue #14 adds a default-off source-review
bridge to the current UI. See the [integration decisions and ordered tasks](architecture/FOUNDATION_INTEGRATION.md)
and [local evidence](evidence/2026-10-04-foundation-integration.md). This does not change
the deployed baseline below or establish semantic accuracy, approved sources or acceptance.

**Follow-up, 4 October:** [Report fixes](evidence/2026-10-04-source-report-followup.md)
separate faithful excerpts from internal omissions and simplify public source
details. [Isolated Neon verification](evidence/2026-10-04-neon-rag.md) passed real
pgvector and the unchanged migration chain through 0006. Its production read-back
found only 0001/0005 recorded; the older "through 0005" baseline below must not be
interpreted as a verified contiguous production chain. Production was unchanged.
That earlier verification did not include a real corpus or embeddings.

**Real-writing follow-up, 4 October:** [Passage and report regressions](evidence/2026-10-04-real-writing-regression.md)
are fixed and migration 0007 preserves all bounded quotation findings. The
[model and Arabic retrieval pilots](evidence/2026-10-04-model-and-arabic-rag-pilots.md)
used synthetic claim controls and real embeddings on an isolated 40-passage Neon
research corpus. Optional provisional semantic assessment is integrated behind a
default-off local flag. Permanent hosted corpus integration, source approval and
broader evaluation remain pending.

**UI and model follow-up, 5 October:** The owner confirmed that supplied writing
is non-private and authorized sending it to models, resolving the previous payload
permission block. The local semantic pilot is enabled for testing; deployment
defaults remain off. [UI and input refinements](evidence/2026-10-05-ui-input-refinements.md)
add bounded editor/loading content, shared classification colors, precise comparison
highlights and explicit assessment states. The first full-writing model run reached
the provider but failed claim validation before assessment. Independent-claim
recovery and a concise extraction prompt repaired that failure. A measured
32.694-second assessment exposed an overly short timeout and missing author
context; v1.3 preserves the full draft as non-evidence context and uses bounded
stage budgets. These are local engineering results, not scholarly acceptance.

The fresh repository baseline contains the completed foundation and architecture work. Current validation is recorded by this repository's GitHub Actions runs. [Issue #27](https://github.com/smaq777/Basira-Hackathon/issues/27) tracks the judge-ready repository and deployment handoff.

| Area                           | Actual state                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product scope and architecture | Documented, not a complete implementation                                                                                                                                                                                                                                                  |
| Documentation                  | English-first; Arabic terminology, source examples and UI retained                                                                                                                                                                                                                         |
| Repository                     | Private `smaq777/Basira-Hackathon`; default/integration branch `development`; production branch `main`                                                                                                                                                                                     |
| Merge method                   | Merge commits enabled; squash, rebase and auto-merge disabled; task branches auto-delete                                                                                                                                                                                                   |
| Integration revision           | `development` and `main` begin from the same fresh baseline containing guest intake/API integration, public-abuse hardening and mobile verification; subsequent work follows Issue-to-PR delivery                                                                                          |
| Branch protection              | Not active; API returns 403 requiring upgrade or public visibility for this private repository                                                                                                                                                                                             |
| Collaborator                   | `AhmedAlbishri` has verified write access and owns assigned API/MCP/RAG implementation; `smaq777` is the sole CODEOWNER, acceptance reviewer and merge authority                                                                                                                           |
| HTTP/API foundation            | Live health/readiness/capabilities plus database-backed guest sessions, documents, revisions, deletion, automatic extraction and idempotent owned review-run creation/status/cancellation                                                                                                  |
| React interface                | Approved Arabic demo plus a Clerk reviewer gate; staging may admit any authenticated hackathon participant while production remains allowlist-first. The same-origin Railway build persists guest drafts and runs automatic extraction while reviewer records remain labelled illustrative |
| Optional voice companion       | Browser-native Arabic proof of value is implemented behind a default-off flag; it is session-grounded, transcript-visible and has no external speech-provider integration                                                                                                                  |
| Contract helpers               | Implemented identifiers/revisions/schema guards, automatic bounded claim extraction, conservative quote comparison, search normalization and failure classification                                                                                                                        |
| Source adapters and RAG        | Deterministic approved-only hybrid ranking core is implemented with synthetic tests; database ingestion, real embeddings and reviewer-labelled recall evaluation remain pending                                                                                                            |
| Approved corpus                | Pending source/rights/content review                                                                                                                                                                                                                                                       |
| Scientific evaluation          | Planned; no measured accuracy, time savings or winning claim                                                                                                                                                                                                                               |
| Deployment                     | Public Railway staging prototype at `https://api-staging-42bc.up.railway.app`; production promotion remains gated                                                                                                                                                                          |
| Database                       | Isolated Railway PostgreSQL staging and Neon production are verified through `0005_expired_guest_cleanup`; the separate least-privilege production runtime connection remains gated                                                                                                        |
| Vercel / Railway               | Deployment configuration and disabled-by-default gates are present. GitHub App connections and provider-side source links must be authorized and verified specifically for this repository before claiming automatic deployment.                                                           |
| Final submission               | Not performed or verified by this foundation work                                                                                                                                                                                                                                          |

Software validation results and GitHub workflow evidence are recorded in the [work log](evidence/2026-09-30.md) and foundation PR. Do not infer 60 passing tests from the planned [60-case catalogue](testing/CASES.md).

## Immediate priorities

1. Pass the real-writing regression gates for complete passage boundaries, source attachment, orthographic comparison and complete report persistence (#11/#12/#14/#18).
2. Present an actionable integrated report with selected-quotation comparison and collapsed attributable context (#16).
3. Compare small-model extraction and stronger evidence-bound assessment on frozen controls, including unavailable providers; enable only a labelled local experiment after validation (#11/#13/#17/#18).
4. Measure a small research corpus on Neon with real embeddings and exact/lexical/dense/hybrid retrieval. Preserve pending approval; complete edition/rights review and least-privilege hosted runtime setup before promotion (#7/#8).
5. Gate AI-ReWrite on stable claims, evidence citations and repeatable assessment; preserve and recheck quoted text (#38).

These priorities follow the 4 October real-writing review. Passing software tests or a small pilot does not establish scholarly accuracy or production readiness.
