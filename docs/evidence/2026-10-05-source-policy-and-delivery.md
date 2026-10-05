# Source discovery and delivery readiness

Development integration in draft PR #59, 5 October 2026. No production deployment, merge, source approval or final submission is claimed.

## Source policy from the hackathon package

`References_and_Data.pdf` (SHA256 `23d776c729fcf68f9c33152a22f34edb4cd80efc7c2b7c15981aff7c5a1cb9c7`, pages 3–4) names five domains now represented in [the JSON source policy](../../config/source-policy.json): dawa.center, islamic-content.com, quranpedia.net, dorar.net and shamela.ws. Dorar is restricted to the listed subject paths; Shamela to book pages. Ibn Baz remains a separately labeled owner selection from the earlier request. Category-level requirements and edition/authenticity review still apply; a listed host does not approve every page or book.

The operator-controlled policy has enabled flags, allowed paths, excluded paths and a deny list. Parsing rejects ambiguous duplicates, wildcard domains and unknown fields. URL validation enforces HTTPS, exact host/path eligibility, no credentials/query redirect tricks, and returned-page identity. Search excerpts only discover URLs; extracted original page text, hashes, timestamps, policy version/hash and source status are retained separately from model prose. Original text is never silently truncated into a purported complete source.

The server adapter uses the owning Firecrawl API key; the Codex research connector is not a runtime dependency. Its default-off flag requires local research preview, semantic assessment and claim retrieval. A bounded semantic gap triggers at most one search, two pages and one affected-claim reassessment. Other first-pass findings remain stable. Reports retain failed/no-result/budget traces; API failure is not a negative religious verdict. [Firecrawl search API](https://docs.firecrawl.dev/api-reference/endpoint/search).

New pages persist in their review report, not in the shared corpus automatically. The reusable Neon manifest requires a separate provenance/rights/content decision. Website eligibility, original-edition verification and scholarly approval are distinct. The current pilot remains pending/research throughout. [Saleh UI issue #68](https://github.com/smaq777/Basira-Hackathon/issues/68) specifies readable source/status presentation without exposing developer traces.

## Findings that change priorities

The [IslamicEval audit](2026-10-05-islamiceval-records-audit.md) confirms a much larger local reference index than the 62-passage hosted corpus and an unintegrated trained classifier. Benchmark answers include intentional errors and must never become RAG truth. Use the dataset for task-specific quotation/role/correction/relevance evaluation, and separately curate its reference originals.

The [six-case sermon diagnostic](2026-10-05-sermon-runtime-diagnostic.md) shows why model strength alone cannot fix coverage: some needed evidence is absent, some quotation spans remain unresolved, and web search may select an unusably large chapter. The next work is targeted corpus coverage, query/passage granularity, and measured role/quotation extraction, alongside human-adjudicated support calibration. Do not treat a missing source as false writing or replace the whole report with an error.

AI-ReWrite should follow the [candidate-revision design](../architecture/AI_REWRITE.md): one-click evidence-preserving improvement, bound citations, independent revalidation and a copy button for the validated candidate. Substantive strengthening waits for supporting evidence. The feature remains off; this work defines its implementation and tests rather than pretending a generator is ready.

## Judging readiness

Weights are transcribed from the supplied final judging guide (page 37), as recorded in [alignment](../hackathon/ALIGNMENT.md). These are evidence/gap assessments, not invented judging scores.

| Criterion                       | Weight | Demonstrable progress                                                                                                                    | Remaining evidence/action                                                                                           |
| ------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Technical implementation and AI |    25% | Persisted current-UI reviews, local originals, live Tafsir, OpenRouter, Neon hybrid retrieval and bounded web integration                | Stabilize live discovery/quotation coverage; accepted hosted end-to-end demo                                        |
| Scholarly reliability           |    15% | Original/hash/attribution lineage, approved-list provenance, independent fidelity/support, explicit research status and failure handling | Reviewer-approved editions/rights and human-adjudicated support benchmark; no scholarly approval claimed            |
| Innovation                      |    15% | Separate correct quotation from unsupported inference; retrieve for author claims and reassess a specific evidence gap                   | Reproducible ablation showing improvement over quote-only retrieval and baseline assessment                         |
| UX and accessibility            |    10% | Existing Arabic long-draft result design and bounded editor; durable refresh reports                                                     | Saleh #68 discovery/source statuses, end-to-end mobile/keyboard checks after final integration                      |
| Track impact                    |    20% | Real public sermon paragraphs now exercise editorial review and qualifying context                                                       | Measure editor time and error detection before/after on comparable tasks; no time-savings claim yet                 |
| Operational feasibility         |    10% | Default-off flags, bounded work, durable failures and isolated persistent Neon corpus                                                    | Hosted release rehearsal, cost/latency accounting including search/embeddings, provider outage exercise and handoff |
| Presentation and verifiability  |     5% | Issue-linked work, reproducible receipts and honest scope/limitations                                                                    | Owner-reviewed public repository, sources/licenses, presentation, <=2-minute video and final portal receipt         |

Near-term sequence: (1) resolve measured retrieval/quotation gaps, (2) validate a small expert-reviewed cross-topic pack, (3) finish source UI and hosted demo/impact evidence, (4) enable constrained rewrite only after its checks pass. Final artifact work should proceed alongside engineering given the 6 October guide deadline. Scope and release acceptance remain with the owner.
