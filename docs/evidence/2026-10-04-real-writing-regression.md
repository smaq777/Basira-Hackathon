# Real-writing regression and local integration

Related to #11, #12, #14, #16 and #18; extends draft PR #59. Acceptance remains with Saleh.

## Reproduction and outcome

A private 2,982 UTF-16-code-unit draft exposed fragmented quoted spans, adjacent-reference leakage, Uthmani presentation differences reported as lexical changes, numeric footnotes counted as quotations, and a five-finding persistence limit. Private input, provider bodies and source corpora remain outside the repository.

The corrected source pipeline is `source-first-intake-1.8/quotation-fidelity-3.0`. Generalized synthetic regression controls were frozen before implementation. The unchanged real draft was rerun through the current Basira-Hackathon UI and API on intake 1.7. Independent review then found that an unbound nested footnote could split off altered wording; intake 1.8 preserves the entire wrapper unless every marker binds to an available verse under a unique attached surah. An offline rerun on 1.8 preserved the twelve-finding outcome and both terminal-word controls.

| Observation                   | Before                                                         | After                                                                   |
| ----------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Quotation findings            | 18, including numeric/formula noise                            | 12: ten Quran passages and two hadith passages                          |
| Wording differences displayed | Five, largely presentation artifacts                           | One: the extra final alef in the quoted word at 51:57                   |
| Canonical passage boundaries  | Altered last word and final word at 51:58 dropped              | Complete authored spans retained; attached verse numeral excluded       |
| Adjacent references           | False 16:36 attribution conflict; ambiguous 23:32; missed 2:21 | References owned by their quotation; intended Quran references resolved |
| 3:102                         | Hadith records embedding the verse took precedence             | Quran identity resolved independently                                   |
| Structured findings persisted | Five of eighteen                                               | All twelve of twelve                                                    |
| Interface                     | Flat long source and result listing                            | Action summary, selected quote/source comparison and collapsed context  |

The remaining first hadith is an unresolved candidate among three research rows; this is not labelled false or authenticated. Faithful excerpts are explicitly separate from full-verse extent and semantic support.

## Validation

- 44 offline Python tests passed, including complete-span, reference ownership, unbound numeric markers, joined-vocative, negation, repeated/partial-token and edition-comparison controls.
- 327 TypeScript/API/UI tests passed with the optional model adapter work. Type checking, documentation, policy, formatting and the integrated build passed. A stalled real-adapter fake fetch was cancelled after 1.1 simulated seconds; the source report persisted with five seconds remaining before the lease deadline.
- New forward migration `0007_complete_quotation_findings` passed on local PostgreSQL, an isolated Neon production-shaped clone and a fresh Neon database. Worker execute permission remained; runtime execute permission was denied. Twelve findings persisted with lease, replay, evidence binding, ownership and RLS checks.
- Hosted verification used PostgreSQL 18.6, pgvector 0.8.6 and pg_trgm 1.6. No production writes; old migrations were not edited.
- Browser reanalysis `b6c1ef61-2011-4678-8135-116e74fdf6fe` completed in 23.25 seconds with all twelve findings persisted. Input hash stayed unchanged. The original report is immutable.
- A preceding browser run hit the 20-second adapter timeout. Repeated normalization of the entire search corpus was removed; the corrected offline intake measured about 3.15 seconds after initialization, and the bounded live-context rerun completed. The failure was not hidden or retried indefinitely.
- At the same 1,392px desktop viewport, the collapsed report height measured 2,427px, with no horizontal overflow. This is a layout observation, not a user-study result.

## Operational limits

The source worker requires migration 0007. Disable `FOUNDATION_ENABLED` to roll back the application feature; preserve migration history and use a later forward fix if necessary. Reanalysis creates a new immutable report rather than rewriting old output.

The UI still depends on the pinned local research corpus and bounded Tafsir acquisition. Source editions remain pending approval. Semantic assessment and real hosted Arabic retrieval are separate measured pilots; these software checks do not establish scholarly accuracy or publication approval.
