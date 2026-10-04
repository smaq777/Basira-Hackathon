# AI foundation integration and delivery decisions

Related to #14; decision record dated 4 October 2026. Implementation is a local,
default-off source-review slice, not a deployment or scientific acceptance.

## Product contract

Keep two independent questions: **quotation fidelity** (مؤشر النقل الحرفي) and
**evidence sufficiency for the claim** (مؤشر كفاية الاستدلال). Do not combine them
into a religious-correctness percentage. Add source identity, excerpt extent,
context coverage, and assessment availability as separate report fields.

An accurately copied, uniquely aligned excerpt can have full quotation fidelity
without quoting the whole ayah. Prefix/suffix coverage is descriptive, not a
penalty. Internal gaps, altered wording, partial-word matches, repeated alignment,
and unresolved source identity need distinct explanations. Whether omitted text
changes the argument belongs to claim-support assessment. A faithful excerpt can
still be insufficient evidence for a broad claim.

Uthmani/imlai differences need a versioned auxiliary comparator with traceable
normalization; preserve the canonical original. The comparator now validates a hashed auxiliary imlai view against canonical
tokens before comparing script variants. Exact excerpts, internal gaps and lexical
changes have separate fields; unsafe or ambiguous alignments remain unresolved. Neither deterministic themes nor a
transport-complete Tafsir packet establishes semantic or scholarly completeness.

## Delivered architecture

The existing Basira-Hackathon React UI and Clerk reviewer flow remain the product
surface. A configured source-review flow persists the exact submitted text as an
immutable revision, queues an idempotent review, polls its durable status, and
loads an owned report. Refresh uses the review identifier; failed real requests
do not become demonstration results. Demonstration results remain labelled.

The Node API owns sessions, access control, review lifecycle and PostgreSQL
storage. A separately privileged worker acquires expiring leases, invokes the
packaged [Python source runtime](../../apps/foundation_worker/README.md), validates
revision/evidence identities, and persists an immutable source report. Runtime
report reads use the guest's signed database context. Cancellation, expiry,
revision changes and stale lease tokens prevent late persistence.

Python is a reproducible repository-local helper, not a dependency on another
checkout's code. Its read-only SQLite/FTS5 index and Tafsir snapshots are external
research data. No corpus or credentials are bundled. This bridge is transitional:
the hosted accepted corpus and retrieval path belong to #5–#8.

The semantic indicator is explicitly **not assessed**, or **not applicable** for
conservatively recognized question/quotation-only input. No model, provider-routing,
hadith-grading or rewrite capability is enabled by this integration.

## Source dependencies: storage and acquisition are separate

| Source                      | Current source-review path                                                      | Qualification                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Quran / Tanzil              | Pinned local canonical text in a read-only SQLite exact/FTS index               | Source/edition approval is still required for hosted use; originals and search views remain separate              |
| Tafsir Muyassar and Saadi   | Stored attributable snapshots originally acquired through TafsirCenterMCP       | Snapshot replay is not a fresh MCP call; retain hashes, parent ayah, footnotes and delivery provenance            |
| TafsirCenterMCP             | Bounded acquisition adapter exists in packaged source code                      | Opt-in live acquisition is allowed only in loopback research preview; offline tests make no network calls         |
| KFGQPC Muyassar             | Local supplied digital package indexed as commentary                            | Separate attributed fallback when a Muyassar snapshot is absent; printed edition unspecified and approval pending |
| Hadith research collections | IslamicEval six-book rows in the configured local index; searched when relevant | Discovery/literal comparison only; no verified authenticity, grading or canonical-numbering claim                 |
| Dorar, HadeethEnc, Shamela  | Exploratory/planned sources                                                     | Not automatic active evidence dependencies                                                                        |

Model memory is not accepted evidence. MCPs acquire context; vetted, versioned
stored passages supply the reproducible evidence packet. These are complementary.

The inspected local manifest contains 6,236 Quran rows, 6,235 commentary rows and
31,811 hadith-matn rows. All are research-only with approval pending. These row
counts are inventory, not verified scholarly coverage; the two fresh HTTP cases
in this integration exercise Quran/Tafsir, not hadith accuracy.

## Hosted RAG decision

Use **Neon-hosted PostgreSQL with pgvector**, with originals, editions, provenance,
parent context and embeddings in the accepted hosted corpus. PostgreSQL/pgvector
does not imply a local-only database. Local PostgreSQL and SQLite are development
fixtures; Railway remains the current API/UI host. Issue
[#8](https://github.com/smaq777/Basira-Hackathon/issues/8) records this decision.

Start with exact-reference and lexical retrieval. Compare dense and hybrid
retrieval on held-out source families; do not equate similarity with truth or
assume hybrid wins. Use exact vector search as the initial measurement baseline;
add HNSW/IVFFlat only if the measured corpus and latency justify it. Keep embedding
failure recoverable: exact retrieval and explicit insufficient-evidence outcomes
must survive. See [Neon's hosted AI primitives](https://neon.com/ai) and
[pgvector's retrieval/index tradeoffs](https://github.com/pgvector/pgvector).

## Ordered implementation tasks

The supplied [final judging criteria](../hackathon/ALIGNMENT.md) prioritize working
technical/AI implementation (25%) and demonstrated track impact (20%), followed by
scholarly reliability and innovation (15% each). A functioning review loop, source
approval, measured calibration and an editor pilot therefore precede extra rewrite
features. The 10% operational-feasibility criterion makes outage/deadline behavior
part of the core; the 10% UX criterion supports retaining the current integrated UI.

The lead freezes contracts, reviews changes and evidence, and integrates scoped
Sol-agent branches. Agents receive non-overlapping file ownership. Saleh retains
acceptance and merge authority; the work below does not close its issues.

| Priority | Issues        | Sol-agent task                                                                                       | Acceptance evidence                                                                                                                                              |
| -------- | ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | #14, #16      | Finish current-UI source review, reports and recoverable lifecycle                                   | Owned input-to-report flow, refresh, cancellation, stale-worker rejection and no demonstration fallback                                                          |
| 2        | #12           | Separate fidelity/extent; fix script and reference-span handling conservatively                      | Full/prefix/middle/suffix verses, ellipses, internal deletion, altered negation, repeated/partial-token excerpts and quote-only controls                         |
| 3        | #4–#9         | Approve a small source corpus; reconcile hosted schema/roles; ingest versioned originals and context | Isolated Neon migration/role tests, edition/rights approvals, manifests, exact/lexical baseline and retrieval recall                                             |
| 4        | #17, #14      | Port assessment-scoped provider blocking and enforce overall deadlines                               | Injected 401/402/403/timeouts across multiple claims; remaining-time/cost accounting; source report survives outage                                              |
| 5        | #11, #13, #18 | Automatic claim/condition attachment and frozen semantic calibration comparison                      | Same evidence packets across baseline, stronger model, independent pair and router; false support/contradiction, abstention, coverage, latency and cost reported |
| 6        | #16, #18      | Editor/judge pilot with reproducible evidence                                                        | Task completion and observed errors; demonstration failures disclosed; no unsupported empirical or religious claims                                              |
| 7        | #38           | Evidence-bound AI-ReWrite                                                                            | Proposal only, citation identity checked server-side, meaning-change diff, new immutable revision, mandatory recheck                                             |

Stronger thinking models are a testable hypothesis, not an accepted accuracy
claim. Avoid serial escalation that exhausts the request deadline, shared-provider
failures masquerading as independent reviewers, and a baseline veto that prevents
valid correction. Preserve substantive disagreements and abstain when evidence or
review capacity is insufficient. A source-only report remains useful during an
API outage, but cannot claim semantic verification.

## Configuration and validation boundary

Default flags in `.env.example` leave the bridge disabled. Enabling requires
migration 0006, a runtime login inheriting `basirah_runtime`, a separate worker
login inheriting `basirah_worker`, Python 3.11+ with SQLite FTS5, and external
index/manifest paths. Approved source editions are required outside local research
preview. Research preview requires a loopback host and non-production mode.
The server never applies migrations. Existing deployment images are not claimed
ready for Python/data mounts; provision and validate those before enabling.

Use `npm run check` and
`python -B -m unittest discover -s apps/foundation_worker/tests -v`.
The latter uses synthetic offline records and is also in CI. Live provider
evaluation, hosted migration and release remain separate scoped operator actions.
See [local integration evidence](../evidence/2026-10-04-foundation-integration.md).
