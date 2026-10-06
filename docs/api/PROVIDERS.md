# Provider and source registry

**Current implementation, 6 October 2026.** API delivery, source rights, scholarly approval and relevance are independent. Runtime registration is not an authority certificate. [Credential setup](../operations/CREDENTIALS.md) covers keys; [architecture](../architecture/ARCHITECTURE.md) explains evidence gates.

## Runtime integrations

| Provider / official links                                                                            | Implemented role and endpoint                                                                            | Important limits                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Tafsir MCP](https://tafsirmcp.netlify.app/), [upstream](https://github.com/tafsircenter/tafsir-mcp) | Public MCP `https://mcp.tafsir.net/mcp`; Quran quotation discovery and attributed Moyassar/Saadi context | Keyless current adapter; pinned tool schemas/protocol; per-work failures retained; upstream catalog size is not Basirah's tested coverage |
| [Quran.com](https://quran.com/), [Foundation docs](https://api-docs.quran.foundation/)               | Existing public `https://api.quran.com/api/v4/quran/verses/uthmani` canonical-text adapter               | Keyless current path; newer Foundation OAuth requires a separate migration, not imaginary current credentials                             |
| [OpenRouter](https://openrouter.ai/docs)                                                             | `https://openrouter.ai/api/v1/chat/completions` and `/embeddings`                                        | Private key, owner budget; configured text model; fixed query-vector model/dimensions                                                     |
| [Gemini](https://ai.google.dev/gemini-api/docs/api-key)                                              | Direct `gemini-2.5-flash:generateContent` availability backup                                            | Explicit activation; same output/preservation gates; no override of invalid output or semantic rejection                                  |
| [Firecrawl](https://docs.firecrawl.dev/)                                                             | Optional search/scrape adapter                                                                           | Explicit web-discovery flag, source policy, budget; results remain candidates                                                             |
| [TinyFish](https://docs.tinyfish.ai/)                                                                | Optional `https://api.search.tinyfish.ai` / `https://api.fetch.tinyfish.ai` search/fetch adapter         | No claim of Agent/MCP runtime use; same policy/provenance gates                                                                           |
| [Neon](https://neon.com/docs)                                                                        | Research corpus SQL and source-contribution overlay                                                      | Not report DB; management MCP is developer tooling, not source authority                                                                  |
| [Brevo](https://developers.brevo.com/)                                                               | Transactional send and delivery-event REST endpoints                                                     | Not a religious evidence source; consent, outbox and verified sender required                                                             |
| [Clerk](https://clerk.com/docs), [Railway](https://docs.railway.com/)                                | Reviewer identity and staging infrastructure                                                             | Authentication is not scholarly credentialing; production promotion deferred                                                              |

## Discovery-only, unavailable and historical candidates

| Source / official website                                                        | Status                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Dorar hadith](https://dorar.net/hadith) and [tafsir](https://dorar.net/tafseer) | Sampled access returned 403; disabled. No supported key/onboarding or working production API is claimed; see [audit](DORAR_AUDIT.md) |
| [Quranpedia](https://quranpedia.net/)                                            | Named discovery source; no accepted runtime API contract                                                                             |
| [Islamic Content](https://islamic-content.com/)                                  | Organizer-reference website; mention does not prove access/redistribution permission                                                 |
| [Dawah Center](https://dawa.center/)                                             | Discovery/reference site, not a verified bulk API                                                                                    |
| [Shamela](https://shamela.ws/)                                                   | Work/edition discovery; reuse needs exact rights/provenance review                                                                   |
| [Tanzil](https://tanzil.net/)                                                    | Separately documented [rights/integrity intake](../content/TANZIL_INTAKE.md); candidate intake is not production approval            |
| [Cohere](https://cohere.com/)                                                    | Historical embedding candidate; not the selected 1536-vector path                                                                    |

`islamiccontent.org` is not the same domain as `islamic-content.com`; do not conflate ownership or permission.

## Tafsir MCP contract

The application negotiates MCP protocol `2025-03-26`, lists tools and checks tested input-schema hashes. It uses `search_quran_text` and `fetch_tafsir` in the current hosted adapter. Do not invent REST routes like `/search` or claim every upstream tool is used. Reference-resolved context, valid footnotes and independently completed works preserve attribution. Responses are byte/request/deadline bounded; malformed schemas fail visibly.

Upstream landing/repository catalogs can differ; do not equate a marketed work count with tested or approved Basirah coverage. Review pinned upstream code/data licenses separately; an MIT client/server license does not automatically license every included work or cached payload. Edition governance is still pending, not silently approved by retrieval.

## Admission, failures and attribution

Evidence must bind source/work/author/reference, original text/window/hash, retrieval provenance, corpus/revision and declared coverage. The report distinguishes Quran text, attributed Tafsir interpretation and generated editorial explanation. No raw HTML is rendered as trusted text.

Unavailable, rate-limited, timeout, invalid response and not-found outcomes are different. A 200 HTML challenge is not valid evidence; an empty hadith result is not a fabrication verdict. Do not repeat a first 401/403 before correcting access or credits. Preserve first failures during acceptance.

Cache/reuse only where permitted; editions, content hashes and policy determine identity. Discovery URLs cannot bypass allowlists or source approval. Two clients wrapping one upstream do not constitute independent provider backups. A fallback work is different evidence and must be disclosed/reassessed.
