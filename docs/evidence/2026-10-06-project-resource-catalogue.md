# Project resource catalogue — 6 October 2026

Related to issue #199. This change responds to the owner's request to populate the reviewer portal's approved-resources page from the project's existing source selection.

## Content and provenance

The shared `SourceInformation` component now presents the catalogue on both the reviewer sources route and public sources route. The reviewer introduction no longer suggests that no resource registry exists. Existing explanations of quotation fidelity, claim support, MCP delivery, and separate human/source approval remain.

The six web resources are derived from `config/source-policy.json`, including its enabled and denied-domain filters. Five are marked as listed in `References_and_Data.pdf` pages 3–4: dawa.center, islamic-content.com, quranpedia.net, dorar.net, and shamela.ws. binbaz.org.sa retains its separate owner-selected basis. Catalogue links open provider homepages; the separate ingestion path restrictions remain unchanged. No policy entries or schema were changed.

The bounded corpus references are the Quran (Tanzil Uthmani 1.1), Al-Tafsir al-Muyassar, Al-Saadi's Taysir al-Karim al-Rahman, Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, and Muhammad bin Khalifa al-Tamimi's Mahasin al-Tawhid wa-Irtibatuha bi-Arkan al-Iman. These names and bounded coverage are supported by `Project_Code/AI_Foundation/experiments/collected-corpus-ingestion-2026-10-06/EMBEDDED_MANIFEST_V1.json` and the submission corpus inventory outside this checkout. They are not claims of complete-book availability.

This is the bundled project catalogue, not a live audit of a deployment's optional operator policy override. Selection for project use does not mark every page, edition, excerpt, or religious conclusion as approved. Stored source approval statuses, corpus data, publication controls, authentication, API/provider settings, and Neon are unchanged.

## Validation

- Targeted catalogue, application, and source-publication tests: 37 passed across three files. The catalogue tests cover disabled/denied filtering, reference names, provider links, organizer versus owner selection, and the limits shown to readers.
- Full repository checks: typecheck, 1,102 passed tests and one skipped across 79 files, documentation links, policy checks, formatting, and production build passed. Vite retains its existing large-bundle advisory.
- Built-browser preview: the shared catalogue rendered at the public sources route with all seven corpus references, six web resources, and the selection-basis labels. Local screenshots are saved in the workspace output directory. Authenticated staging verification remains an owner-side check after merge and deploy; authentication was not bypassed for the preview.

## Acceptance and rollback

Owner acceptance and deployment remain separate. After deployment, confirm the authenticated reviewer sources page lists the same catalogue as the public sources page. No database migration is required. Revert this UI commit to roll back.

## Owner-approved presentation and source links

The owner accepted the reorganized local presentation and authorized Railway staging deployment. The existing Cairo type, navy/teal palette and RTL shell are retained. Seven references are grouped into Quran/tafsir, hadith and theology cards; six selected websites retain their selection-basis labels. Section navigation moves focus without replacing the SPA hash route. All methodological explanations remain available through native expandable sections. The shared component serves both public and reviewer routes. The annotated homepage partner heading and official link are centered; the accepted seven-logo marquee is preserved.

Each text-reference card now links to retained provenance. A read-only lookup of source editions in the active pinned submission snapshot confirmed Tanzil, the King Fahd Complex publisher, the Tafsir MCP endpoint, the pinned hadith dataset and the exact Shamela excerpt page. The lookup used the existing corpus reader and its existing research runtime role; no data, roles or approval states changed. The first query without the runtime role returned SQL42501; the existing reader transaction pattern was then used. A passage-version filter returned only two editions, so the final query used the application's immutable snapshot membership instead.

| Reference                  | Link and basis                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quran                      | Stored Tanzil Uthmani XML download URL, including its recorded query parameters.                                                                                                                                                  |
| Al-Tafsir al-Muyassar      | `https://qurancomplex.gov.sa/quran-dev/`, recorded publisher URL.                                                                                                                                                                 |
| Al-Saadi                   | `https://github.com/tafsircenter/tafsir-mcp`, the project documented in `docs/api/PROVIDERS.md` and used by `apps/api/src/tafsir-mcp.ts`; labelled as the retrieval project, rather than sending readers to the MCP API endpoint. |
| Bukhari, Muslim, Abu Dawud | Stored `Watheq9/IslamicEval2026/Corpora/six_hadith_books.json` at revision `8ca8abb8a0f0d96a5ab07d48108e35b7e02d236e`; explicitly labelled as the pinned dataset used.                                                            |
| Mahasin al-Tawhid          | Stored `https://shamela.ws/book/30015/195`, the exact retained excerpt page.                                                                                                                                                      |

Upstream browser retrieval confirmed the Tafsir project, pinned GitHub dataset page and Shamela excerpt. The publisher request timed out and the Tanzil XML request was not rendered by that retrieval tool; these remain provenance-confirmed links, not claims of a current uptime check. No substitute URLs were invented.

Focused validation after the link update: typecheck and 38 tests across the catalogue, application and source-publication suites passed. Browser inspection confirmed seven reference links, six website links, section-focus navigation with `#/sources` preserved, and expandable MCP explanation. At the observed 400 CSS-pixel viewport, cards form one column with no horizontal overflow; at desktop they use the existing two-column card layout. The partner heading, eyebrow and official link share the same horizontal center. Full checks and staging evidence are recorded on issue #199 after integration.

Rollback remains a revert of the presentation change; no database migration is needed. The owner retains issue closure after acceptance.
