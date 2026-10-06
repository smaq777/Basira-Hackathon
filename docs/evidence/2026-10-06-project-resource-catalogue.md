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
