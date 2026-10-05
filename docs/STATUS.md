# Current delivery status

## Latest development evidence — 5 October

Draft PR #59 now connects the current UI to persisted review reports, local quotation lookup, live Tafsir context, OpenRouter claim assessment, and a persistent isolated Neon hybrid-retrieval corpus. Optional gap-triggered Firecrawl acquisition is controlled by `config/source-policy.json`; UI follow-up is assigned to Saleh in [#68](https://github.com/smaq777/Basira-Hackathon/issues/68). Features remain research-only/default-off and are not deployed or owner-accepted merely because local checks pass.

The Neon research corpus has 62 originals; the larger local index has 6,236 Quran, 6,235 Tafsir and 31,811 hadith entries. Only four IslamicEval hadith originals are currently hosted. Benchmark answers/gold are evaluation material, not retrieval evidence. The trained role classifiers are not live. See [dataset/records audit](evidence/2026-10-05-islamiceval-records-audit.md).

**Reusable acquisition update, 5 October:** Eligible public originals can now be automatically topic-classified by the small model and stored in a separate pending Neon research cache through migration 0010 and a dedicated least-privileged writer. Two real public pages passed persistent reuse, original-hash, expiry/revocation, and privacy checks; the frozen 62-passage corpus remains unchanged. Cached pages participate in initial retrieval, while remaining evidence gaps may use explicitly selected Tinyfish-first acquisition with Firecrawl fallback. All optional flags default off. The authorized cache profile uses 240/90/65/45-second phase ceilings within a 300-second review deadline; this is not a latency guarantee, scholarly approval, resolved publication rights, or production activation. See [cache evidence](evidence/2026-10-05-reusable-research-page-cache.md) and [setup](operations/SETUP.md#research-cache-and-discovery-profile--5-october).

The tables below retain deployment/baseline context; this development evidence does not promote production, resolve source rights, or establish scholarly accuracy.

Live verification and the fixes for report-size failure and cache-search timeout are recorded in the [runtime integration diagnostic](evidence/2026-10-05-web-cache-runtime.md). Cached sources remain research evidence even when a model finds a claim supported; software delivery checks are separate from adjudicated semantic calibration.

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

**Staging connection diagnostic, 5 October:** [Issue #69 evidence](evidence/2026-10-05-staging-api-routing.md)
verified that the reported Vercel frontend returns 404 for API routes while the
Railway staging API is reachable at migration 0005 and does not advertise
`foundationReview`. A separately selected staging proxy configuration and clearer
client readiness/errors are implemented for review. Deployment and PR #59's
connected source-report readiness remain separate gates; follow the
[staging runbook](operations/STAGING_CONNECTION.md).

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

1. **Evidence coverage and measured routing quality (#8/#11/#18):** expand a small topic-diverse, attributed research corpus; evaluate lexical/dense recall and shadow-test the saved role classifier on untouched groups. Keep benchmark examples/gold separate from originals. Do not bulk-import research-only answers.
2. **Support calibration and web budget (#13/#18):** use frozen public-sermon excerpts and explicit negative controls; separate source gaps, model errors, and provider failures. Preserve qualifying context. Require human scholarly adjudication before claiming correctness scores.
3. **Source/discovery UX (#16/#68, Saleh):** show concise Arabic outcomes, readable titles and citations, and source eligibility distinct from approval. Developer trace stays out of ordinary result cards.
4. **Submission operations and impact (#17/#18):** reproducible hosted demo, provider failure rehearsal, measured editor task timing, license/rights inventory, owner-reviewed public release, presentation/video and final portal receipt. No production promotion or release is implied by local testing.
5. **Evidence-bound AI-ReWrite (#38):** generate a separate draft from validated findings, preserve quoted text and original revision, cite actual sources, recheck the result, then offer copy. Do not make stronger unsupported assertions or silently turn research findings into approval.

Current runtime flow and proposed normalized records are reconciled in [system blueprint](architecture/SYSTEM_BLUEPRINT.md) and [data model](architecture/DATA_MODEL.md).
