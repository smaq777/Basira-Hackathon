# Current delivery status

Baseline date: **3 October 2026**. See live issues and PR checks for subsequent progress.

**Local implementation update, 4 October:** Issue #14 adds a default-off source-review
bridge to the current UI. See the [integration decisions and ordered tasks](architecture/FOUNDATION_INTEGRATION.md)
and [local evidence](evidence/2026-10-04-foundation-integration.md). This does not change
the deployed baseline below or establish semantic accuracy, approved sources or acceptance.

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

1. Configure and verify the separate least-privilege Neon production runtime connection before promotion, then document scheduled cleanup and backup retention.
2. Approve 30–50 source passages, their rights and reference coverage.
3. Implement one end-to-end review slice with citation and revision guards.
4. Add bounded fallback and privacy controls, then independent scientific evaluation.
