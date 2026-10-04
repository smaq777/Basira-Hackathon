# Provider and source registry

An API is a delivery mechanism, not an authority certificate. Source approval, usage rights, operational reachability and content suitability are separate checks.

| Source / service                                | Intended use                                                  | Evidence and current limit                                                                                | Fallback                                                           |
| ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Tafsir MCP](https://tafsirmcp.netlify.app/)    | Quran text and attributed tafsir (تفسير) retrieval            | Public documentation/repository reviewed; integration not implemented; selected works still need approval | Licensed pinned snapshots of the same approved edition             |
| [Dorar](https://dorar.net/hadith)               | Hadith lookup and source-attributed scholarly grading         | Supplied PDF and legacy examples reviewed; sampled API requests returned 403                              | Limited approved local references or explicit human-review outcome |
| [Dorar tafsir](https://dorar.net/tafseer)       | Source/reference discovery                                    | Reference website; no general production API assumed                                                      | Approved edition ingestion with permission                         |
| [Quranpedia](https://quranpedia.net/)           | Quran-related reference discovery                             | Listed reference source; integration contract not verified                                                | Approved Quran reference snapshot                                  |
| [Islamic Content](https://islamic-content.com/) | Reference content in organizer package                        | Website mention is not API permission or a verified endpoint                                              | Manual approved curation                                           |
| [Dawah Center](https://dawa.center/)            | Reference/content discovery                                   | Availability of a website does not establish API, bulk use or redistribution rights                       | Manual approved curation                                           |
| [Shamela](https://shamela.ws/)                  | Named work/reference discovery                                | Edition, provenance and redistribution need review                                                        | Approved bounded excerpts only                                     |
| Cohere                                          | Candidate Arabic embeddings                                   | Model candidate; no account/model evaluation completed                                                    | Exact/lexical retrieval; never mix vector spaces                   |
| Reasoning/extraction provider                   | Structured extraction and evidence-bounded support assessment | Provider/model selection pending measured Arabic benchmark                                                | Partial deterministic result or explicit abstention                |

The user also suggested `islamiccontent.org`; it is **not the same domain** as `islamic-content.com` in the reference package. Do not conflate their content, ownership or permissions.

## Tafsir MCP integration contract

Upstream: [tafsircenter/tafsir-mcp](https://github.com/tafsircenter/tafsir-mcp). The reviewed README lists `https://mcp.tafsir.net/mcp` as its remote MCP endpoint. This is an MCP endpoint, not an arbitrary JSON REST route. Use a standards-compliant client and negotiate protocol/session details; do not invent a `/search` endpoint.

Documented tool examples include `fetch_ayah`, `fetch_tafsir`, `search_quran_text` and `search_in_tafsir`. Documented resources include `quran://surahs`, `quran://tafsirs` and `quran://schema`. Fetch `tools/list` and validate actual input/output schemas when implementing; these names do not establish an observed successful call in Basirah.

Pin the tested server/data revision. The landing page and repository have presented differing tafsir counts; do not claim a definitive count without inspecting the running version. Availability of a later tafsir in the tool does not automatically satisfy the organizer's source-selection policy.

The repository advertises MIT code and a separate data license. Review the exact pinned `LICENSE` and `LICENSE-DATA`, each included work's rights, and attribution before caching or redistributing. Code licensing alone does not settle content rights.

## Adapter interface to implement

`retrieve(query, approvedSourceScope, deadline)` should return validated evidence or a typed operational failure. Required metadata: provider, work, author, edition, reference, original text, retrieval timestamp, content hash, delivery mode and rights/approval linkage. Never let a provider response directly define the application's trust policy.

Operational categories: `unavailable`, `rate_limited`, `timeout`, `invalid_response`, `not_found`. A 200 response with an HTML challenge is invalid data, not success. A provider's empty result does not establish that a hadith is fabricated.

## Bounded retry and cache policy

Proposed initial request budget: at most two attempts per provider operation, exponential backoff with jitter for timeout/429/5xx, honoring bounded `Retry-After`. No automatic repeat of 401/403 until credentials/access change. Circuit-break repeated failures and expose provider status without leaking headers or credentials. Calibrate timeouts in integration tests.

Cache only when permitted. Keys include source edition, query/tool parameters and normalization version. Snapshot selection must preserve source identity and disclose retrieval date. Two libraries wrapping the same Dorar endpoint are **not independent backup providers**.

## Integration acceptance checklist

- [ ] Authoritative schema and terms recorded for the pinned version.
- [ ] Approved happy-path response and real failure response captured with sensitive data removed.
- [ ] Timeouts, 403, 429, HTML challenge and malformed JSON tested.
- [ ] Attribution and context preserved; raw HTML never rendered.
- [ ] Equivalent-source fallback and non-equivalent-source disclosure tested.
- [ ] Real integration results reported separately from mocked tests.
