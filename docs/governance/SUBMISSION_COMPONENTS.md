# Submission component and rights ledger

Recorded 6 October 2026 for [issue #198](https://github.com/smaq777/Basira-Hackathon/issues/198). This inventory is not a completed rights certification. Delivery, licensing, content permission and qualified approval are separate.

## Code and tooling

Basirah-authored software is [MIT-licensed](../../LICENSE). AI assistance and preparation are disclosed in the README and [pre-work log](../evidence/2026-09-30.md). Contributor permission/ownership declarations remain an owner submission task.

Direct runtime metadata below was read from installed packages matching the current lockfile. Preserve actual LICENSE/NOTICE files; metadata is not an exhaustive transitive-license audit.

| Component                             | Version                  | Declared license | Purpose                 |
| ------------------------------------- | ------------------------ | ---------------- | ----------------------- |
| React / React DOM                     | 19.3.0                   | MIT              | Browser UI              |
| Express                               | 5.2.1                    | MIT              | API                     |
| pg                                    | 8.23.1                   | MIT              | PostgreSQL              |
| Zod                                   | 4.6.5                    | MIT              | Contract validation     |
| Clerk Express / React / localizations | 2.1.75 / 6.17.5 / 4.21.2 | MIT              | Identity/UI integration |
| Phosphor React icons                  | 2.1.10                   | MIT              | Icons                   |
| Fontsource Cairo                      | 5.3.0                    | OFL-1.1          | Arabic typography       |

[package.json](../../package.json) and [lockfile](../../package-lock.json) identify direct/transitive runtime and build/test components. Node24/npm11, TypeScript, Vite, Vitest, Testing Library, Prettier and Python scripts provide tooling. Dependency vulnerability checks do not certify licensing. Review final bundled assets/transitive notices before distribution. Private development MCP configuration and AI transcripts are excluded.

## Services, data and assets

| Service/material                                                               | Use / recorded period                                     | Rights/approval boundary                                                                                                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Tafsir Center MCP](https://github.com/tafsircenter/tafsir-mcp)                | Live Quran search/Moyassar/Saadi, October4–6              | Separate code/data licenses; pinned editions and caching/redistribution permissions need review; operational qualified approval pending          |
| [Quran.com](https://quran.com/)                                                | Canonical Uthmani API text, October6 cases                | Retain reference/edition; public API access is not blanket redistribution permission                                                             |
| [Tanzil](https://tanzil.net/)                                                  | Candidate Quran source intake                             | [License/integrity record](../content/TANZIL_INTAKE.md); candidate approval is not the whole live corpus's approval                              |
| Frozen175 corpus and reviewed overlay                                          | Hashed retrieval snapshot                                 | Pin7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f; complete work-level permissions ledger; do not distribute raw corpus as MIT |
| [OpenRouter](https://openrouter.ai/) / routed models                           | Text tasks/embeddings                                     | Hosted service/model terms, no bundled weights; actual provider/model and owner budget recorded; synthetic competition inputs                    |
| [Gemini](https://ai.google.dev/)                                               | Availability-only text backup                             | Google project/service terms; keys/accounts not transferred                                                                                      |
| [Firecrawl](https://www.firecrawl.dev/) / [TinyFish](https://www.tinyfish.ai/) | Optional discovery                                        | Service terms plus independent rights of each discovered work; no automatic approval                                                             |
| [Neon](https://neon.com/) / [Railway](https://railway.com/)                    | Research SQL/report storage/hosting                       | Owner accounts; reproduction instructions instead of secrets/account transfer                                                                    |
| [Clerk](https://clerk.com/) / [Brevo](https://www.brevo.com/)                  | Identity/consented transactional mail                     | Service/data terms separate from SDK licenses; contact records excluded from public materials                                                    |
| Discovery-only/unavailable references                                          | Dorar, Quranpedia, Islamic Content, Dawah Center, Shamela | [Registry](../api/PROVIDERS.md) does not claim API contracts or permission                                                                       |
| Organizer guide/logos/reference PDFs                                           | Rules/source inspection                                   | Not relicensed here; guide/PDF files not bundled; verify permitted identity/logo use in deck                                                     |
| Basirah branding/proposal/demo assets                                          | UI/presentation                                           | Owner confirms authorship, permission and intended public release; attachment/existing file alone proves neither                                 |

The submission product URL is Railway API staging only, not an alternate preview host.

## Complete the source record before claiming compliance

For every included edition/asset record title/type, author/provider, edition/version, URL, acquisition/use date, purpose, permission/license basis, caching/redistribution limits, attribution, approval owner and withdrawal process. Keep personal permission correspondence private, publishing an appropriate summary. See [rights policy](RIGHTS.md).

The owner must settle exact source/asset permissions and the original dated baseline. Do not silently substitute sources or lower evidence checks to hide missing approval. Never bundle credentials, contact records, private screenshots or real beneficiary conversations.
