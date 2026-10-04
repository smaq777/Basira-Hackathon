# Acceptance test catalogue

All rows below are **planned product acceptance cases** unless a linked automated test explicitly demonstrates the narrower behavior. They are not a completed 60-case scientific benchmark. Use synthetic fixtures first; content judgments require approved sources and expert-labeled expectations.

| ID     | Scenario                                        | Expected result                                                |
| ------ | ----------------------------------------------- | -------------------------------------------------------------- |
| TC-001 | Empty draft                                     | Clear validation error; no provider call                       |
| TC-002 | Whitespace-only draft                           | Reject                                                         |
| TC-003 | Maximum allowed draft                           | Accept without truncating Arabic                               |
| TC-004 | Oversized draft                                 | Reject with the documented limit                               |
| TC-005 | Mixed Arabic/English and punctuation            | Preserve original text and offsets                             |
| TC-006 | Single explicit claim                           | Extract correct span for user confirmation                     |
| TC-007 | Multiple claims                                 | Keep distinct IDs and spans                                    |
| TC-008 | Quotation nested inside commentary              | Separate quoted text and inference                             |
| TC-009 | Ambiguous extracted claim                       | Request correction, not invented specificity                   |
| TC-010 | User removes an extracted claim                 | Exclude it from the confirmed run                              |
| TC-011 | Exact source quotation                          | Exact-match outcome with reference                             |
| TC-012 | Permitted diacritic-only variation              | Disclose normalization; preserve original                      |
| TC-013 | Negation removed                                | Do not normalize away the change                               |
| TC-014 | Condition removed inside quotation              | Flag mismatch with exact source span                           |
| TC-015 | Ellipsis in quote                               | Explain omitted context; no fabricated completion              |
| TC-016 | Correct surah/verse reference                   | Resolve the approved edition                                   |
| TC-017 | Correct text, wrong verse number                | Flag attribution/reference mismatch                            |
| TC-018 | Hadith source with named scholar grading        | Preserve attribution; no independent regrading                 |
| TC-019 | Same wording, different source edition          | Display edition distinction                                    |
| TC-020 | No source located                               | Unresolved, not fabricated/false by default                    |
| TC-021 | Bounded conclusion supported                    | Evidence-linked support within scope                           |
| TC-022 | Unqualified generalization                      | Flag only with reviewer-confirmed context                      |
| TC-023 | Omitted material qualification                  | Identify the missing condition                                 |
| TC-024 | Unsupported “only” claim                        | Identify unsupported exclusivity                               |
| TC-025 | Correct quote, unsupported conclusion           | Separate positive quote and negative support states            |
| TC-026 | Insufficient approved evidence                  | Explicit abstention                                            |
| TC-027 | Personal fatwa question                         | Out-of-scope guidance, no ruling                               |
| TC-028 | Attributed scholarly disagreement               | Preserve alternatives; request review where needed             |
| TC-029 | Unapproved source gives easy answer             | Exclude from authoritative evidence                            |
| TC-030 | Model supplies an unrequested religious verdict | Reject or route for review                                     |
| TC-031 | Exact reference retrieval                       | Expected passage ranks/resolves correctly                      |
| TC-032 | Lexical retrieval without embeddings            | Disclosed degraded but usable path                             |
| TC-033 | Paraphrase retrieval                            | Relevant passage among reviewed candidates                     |
| TC-034 | Duplicate evidence from two APIs                | Deduplicate by source identity, not count as corroboration     |
| TC-035 | Missing neighboring context                     | Restore it or abstain                                          |
| TC-036 | Provider 403                                    | No repeated unauthorized requests; typed unavailability        |
| TC-037 | Provider 429                                    | Bounded backoff honoring permitted retry window                |
| TC-038 | Timeout/5xx                                     | Bounded retry and disclosed fallback                           |
| TC-039 | HTTP 200 HTML challenge                         | Reject as invalid provider data                                |
| TC-040 | Reasoning provider fails                        | No fabricated support judgment                                 |
| TC-041 | Same-edition snapshot fallback                  | Display snapshot identity/date                                 |
| TC-042 | Different-source fallback                       | Reassess with explicit changed attribution                     |
| TC-043 | Embedding model changes                         | Reject incompatible existing vectors                           |
| TC-044 | Source approval revoked                         | Exclude from future retrieval; mark affected stored reports    |
| TC-045 | Circuit breaker opens                           | Avoid repeated calls; show recovery status                     |
| TC-046 | Invented evidence ID                            | Reject finding                                                 |
| TC-047 | Old revision output arrives late                | Reject stale finding                                           |
| TC-048 | User edits and rechecks                         | New revision/run, not silent overwrite                         |
| TC-049 | Duplicate submission/idempotency key            | One logical run, no duplicate billing attempt                  |
| TC-050 | Server restarts mid-run                         | Recover under defined lease policy or mark interrupted         |
| TC-051 | Guest A requests Guest B report                 | Deny access                                                    |
| TC-052 | Session expires/deletes                         | No accessible retained guest report                            |
| TC-053 | Prompt injection inside source/post             | No instruction execution or tool escalation                    |
| TC-054 | HTML/script in provider text                    | Safe rendering                                                 |
| TC-055 | User supplies arbitrary private-network URL     | No arbitrary fetch                                             |
| TC-056 | Keyboard-only RTL flow                          | Complete intake, review and export with visible focus          |
| TC-057 | Mobile finding/source navigation                | Selected claim remains clear; no clipped Arabic                |
| TC-058 | Color-blind/screen-reader use                   | Text labels and semantics communicate state                    |
| TC-059 | Export unresolved case                          | Include evidence, provenance, limitations and review questions |
| TC-060 | Committee clean-install demonstration           | Reproducible documented build and honestly scoped live flow    |

Track implementation and evidence in [GitHub Issues](https://github.com/smaq777/basirah/issues). Record actual automated test counts from the runner; do not infer them from this table.
