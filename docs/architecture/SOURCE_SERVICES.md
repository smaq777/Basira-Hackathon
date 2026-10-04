# Source acquisition, report language and model roles

Related to #8, #12, #14, #16 and #17. Decision/evidence: 4 October 2026.

## Storage and MCP are complementary

Use Neon PostgreSQL/pgvector as the hosted evidence store. Acquire missing context
through pinned source adapters and preserve attributable, versioned snapshots.
The local SQLite index is a transitional development source, not the hosted RAG
target. An MCP is a delivery interface, not a substitute for provenance or storage.
Exact quotation checks must remain available when a provider is unavailable.

The user approved the listed source providers for project use. This does not
invent an edition audit, redistribution permission, hadith grade or scholarly
review of a conclusion. Existing `approvalStatus` describes the recorded digital
edition workflow; its pending values came from the research manifest, not an LLM.
Do not relabel those records as scholarly approval. Public reports show readable
attribution; source hashes and transport diagnostics remain backend/development data.

## Observed Tafsir MCP services

The live `tools/list` returned **17 tools**. `list_all_sources` reported 36 entries
(28 tafsir, eight Quran-science entries); `list_sources_for_ayah` reported 33
covered and three uncovered entries for 39:38. These are provider inventory
observations, not independently validated scholarly coverage.

| Tools                                                                                      | Intended routing                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `list_tafsir_sources`, `list_science_sources`, `list_all_sources`, `list_sources_for_ayah` | Cache catalog/coverage for source selection; avoid fetching every work per request.                                                  |
| `fetch_ayah`, `search_quran_text`                                                          | Resolve verse references and compare against the pinned canonical text.                                                              |
| `fetch_tafsir`, `search_in_tafsir`                                                         | Discover relevant commentary, then fetch attributed context. Start with Muyassar/Saadi; select additional works for a specific need. |
| `fetch_nuzool_reason`                                                                      | Retrieve reported occasion of revelation when relevant; absence is not proof of no occasion.                                         |
| `analyze_word`, `find_root_occurrences`, `get_root_stats`                                  | Assist lexical questions; shared roots do not prove identical meanings.                                                              |
| `get_qeraat_variants`                                                                      | Investigate explicitly identified readings; never silently excuse a typo as another reading.                                         |
| `fetch_surah_info`, `get_quran_overview`, `get_page_fawaed`, `get_surah_statistics`        | Optional structural/context information, not independent claim-support verdicts.                                                     |

This is a routing plan, not a claim that all 17 tools are connected to the UI.
The existing bounded adapter fetches the selected commentary. Fresh acquisition of
39:38 returned one available part each for Muyassar and Saadi in five requests.
Its earlier partial UI context reflected a snapshot gap, not provider absence.
The separate inventory audit also used five requests. No model was called.

Local opt-in `FOUNDATION_TAFSIR_LIVE=true` requires research preview, non-production
mode and a loopback host. Only validated numeric verse references reach the fixed
endpoint. The adapter pins the tested schema, caps each acquisition at 12 seconds,
19 requests and 1 MB, with no automatic retries. Snapshot replay reports snapshot
delivery while retaining original acquisition provenance. Hosted activation and
edition ingestion remain a separate reviewed change.
Unavailable context is cached for 30 seconds, with no repeated attempt for the
same reference within an intake; later reviews can recover. An actual local HTTP
review for 112:1 verified fresh MCP delivery of both selected works.

Source: [Tafsir Center's upstream repository](https://github.com/tafsircenter/tafsir-mcp).
Captured responses/receipts remain in the external research workspace under
`AI_Foundation/experiments/source-services-next-v1`; corpus responses are not shipped
in this repository.

## Report semantics and the example

Quotation fidelity and extent are independent. A uniquely aligned correct excerpt
can be exact or orthographically equivalent without reproducing the whole ayah.
An internal omission is separately identified. The tested 39:38 input starts
`وَإِنْ` instead of `وَلَئِن` and omits `والأرض` inside its quoted span; it must
still show wording differences. Original Arabic and canonical offsets stay intact.

Question/quotation-only input may have no claim to assess. A conservative syntax
helper identifies that applicability, with an undetermined fallback. It does not
answer the question or establish claim truth. Declarative assertions are not
silently discarded. There is currently **no semantic model prompt executed** by
the integrated source report. The earlier human-confirmation wording was a fixed
worker/UI rule, not a model rejection.

Public source citations name the surah/ayah, tafsir work or hadith work. Internal
dataset IDs are not canonical hadith numbers. Only a derived Quran.com reader URL
is offered as a reading aid; arbitrary stored download URLs are not rendered.
Older reports remain immutable. Explicit reanalysis creates a new revision/run;
new comparison/context results are not silently written into historical reports.

## Model work in order

1. Keep quotation comparison and its Arabic explanations deterministic.
2. Evaluate a small structured-output model for proposed claim extraction,
   conditions, negation, exceptions, scope and attachment to source IDs. Include
   question-only, quote-only and mixed assertions as controls. Never use model
   memory as source evidence.
3. Give the support assessor only confirmed claims and bounded original evidence.
   Require cited IDs, preserved conditions and an insufficient-evidence outcome.
4. Compare a baseline, stronger reasoning model and router on identical frozen
   evidence, measuring false support, abstention, coverage, latency and cost.
   Structured output guarantees shape, not semantic correctness.
5. Implement provider deadlines/outage recovery before enabling model judgment.
   A failed model leaves the source report usable and inference unassessed.
6. Add AI-ReWrite only after those gates: proposal, source checks, meaning-change
   comparison and reanalysis as a new immutable revision.

Flash-class models are candidates for extraction/wording, not a required dependency
for these UI fixes. Exact model availability and a bounded evaluation budget must
be established before paid testing. No stronger-model advantage is asserted here.
