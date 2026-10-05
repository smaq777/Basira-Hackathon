# Current delivery status

**Hosted retrieval follow-up, 5 October:** The
[persistent Neon development corpus](evidence/2026-10-05-hosted-source-corpus.md)
contains 62 attributed research passages and compatible embeddings with a
dedicated read-only runtime login. Claim-driven retrieval and explicit book/scholar
roles now augment the evidence packet before assessment and persistence. The
[eight-case controlled web experiment](evidence/2026-10-05-controlled-web-discovery.md)
found useful incremental context in five cases; two acquisition failures and one
no-result control remain recorded. Firecrawl stays experimental without a new UI.
Source approval, broader scholarly evaluation, production activation and
AI-ReWrite remain gated. Historical baseline entries below describe their dated
verification rather than the current development implementation.

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

**Evidence coverage follow-up, 5 October:** The [six-call comparison](evidence/2026-10-05-evidence-coverage-calibration.md)
separates source gaps from prompt sensitivity. Adding the owner's attributed
sources supported all four selected claims with the old prompt; the revised
enriched response failed an exact-citation check and remains recorded as invalid.
The optional v1.4 prompt clarifies semantic entailment and acquisition metadata
without weakening source validation. Repeated editorial notes are consolidated
with their affected passages. Claim-driven retrieval and a persistent typed Neon
source corpus are now the next implementation priorities.

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

1. Separate missing evidence from assessment calibration. Compare fixed claims on original/enriched packets with old/new instructions, including negative controls. Explain compound assertions without treating an unsupported qualifier as a contradiction (#13/#18).
2. Split claim extraction from assessment and retrieve evidence for each assertion before freezing its final evidence packet. Preserve the independent quotation-comparison path and existing outage recovery (#8/#11/#14/#17).
3. Add explicit scholarly-book/explanation source roles and typed cross-work links; ingest a versioned, reviewable source corpus into Neon with context, footnotes and compatible pgvector embeddings. Evaluate retrieval recall separately from support accuracy (#5/#6/#7/#8).
4. Add bounded web discovery for identified gaps through configured sources, verified originals and attributed snapshots. Build a held-out, topic-diverse evaluation with human adjudication; keep editorial guidance concise and linked to actual passages (#8/#9/#16/#18).
5. Gate AI-ReWrite on stable claims, evidence citations and repeatable assessment; preserve and recheck quoted text (#38).

These priorities follow the [5 October coverage review](evidence/2026-10-05-evidence-coverage-calibration.md).
The earlier quotation/UI fixes and isolated Neon/model pilots are completed development
evidence, not a persistent hosted source corpus or scholarly accuracy measurement.
