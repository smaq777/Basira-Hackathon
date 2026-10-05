# AI Foundation delivery priorities — 5 October 2026

This dated plan supersedes the earlier foundation tracker's old-repository issue
numbers and inactive local app status. The Basira-Hackathon UI and API are the
implementation target. Saleh (`smaq777`) owns acceptance and merge; agents can
continue isolated implementation and integrated local tests before acceptance.

## Verified current state

- The integrated loopback app uses an 86-passage Neon research snapshot, live
  Tafsir acquisition, claim retrieval, model assessment and optional approved-URL
  discovery/cache. A newly completed report verifies actual corpus use.
- Eleven new topic-classified public originals increased the separate pending
  cache from 5 to 16 visible rows. One article-missing extraction was quarantined.
  See [source-quality evidence](../evidence/2026-10-05-source-cache-quality.md).
- [Fixed-evidence model comparison](../evidence/2026-10-05-fixed-packet-routing.md)
  is complete as a selected engineering diagnostic. It establishes neither
  general stronger-model benefit nor consistent detailed qualifier fields.
- [Claim recovery PR #77](https://github.com/smaq777/Basira-Hackathon/pull/77)
  implements bounded reconsideration of a valid empty selection. One fresh
  source-free hadith-studies UI report now reaches actual Neon/cache retrieval
  and assessment. Another mixed 31:15 trial failed claim binding and remains
  recorded. Exhaustive extraction and editor confirmation are still open.
- [Rewrite PR #76](https://github.com/smaq777/Basira-Hackathon/pull/76) now
  requires explicit modality preservation. The integrated UI generated wording
  retaining absence of obligation and obligation, preserved the Ayah, displayed
  before/after and completed its copy action using a retained supported report.
  This does not establish general reliability or fresh extraction success.
- PRs #59 and #70–#78 were open/unmerged at this checkpoint. Required CI passed
  for #76–#78 at their published commits. Local activation is not shared staging
  deployment, source approval or Saleh acceptance.

## Ordered implementation and evaluation

| Order | Task                                                | Current evidence and next requirement                                                                                                                                                                                                                                                         | Issue              |
| ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1     | Claim-selection consistency                         | Bounded empty-selection recovery is implemented and one source-free UI case now reaches evidence. Malformed selections can still fail; retain these outcomes, test representative mixed writing and add the still-pending editor confirmation.                                                | #11                |
| 2     | Rewrite modality preservation                       | Version-2 guard and selected controls are implemented; integrated before/after and copy UI preserve explicit modality on an existing supported report. Broader independently reviewed preservation and ambiguity controls remain pending.                                                     | #38                |
| 3     | Relevant passage retrieval and topic coverage       | Grow contextual sources across the nine labels, with independent works and exact parent bindings. Implement compact retained-parent passage storage/vector retrieval before claiming full-page packet headroom is solved. The 170-passage plan and underrepresented labels remain unfinished. | #5/#7/#8           |
| 4     | Semantic calibration and Arabic explanation quality | Evaluate qualifier-to-proposition attachment separately from relation labels. Include unrelated/insufficient evidence and unresolved multi-clause writing, retain failures, compare fixed packets, then test the whole pipeline. No empirical religious accuracy claim without adjudication.  | #13/#18            |
| 5     | Shared staging integration                          | Accept the dependency PRs into development, configure the explicitly selected staging API/proxy and provider readiness, then verify the same public UI end to end. Current local loopback research gates need a separately reviewed hosted staging configuration.                             | #14/#20/#69        |
| 6     | Committee and beneficiary evidence                  | Produce a reproducible working demo, traceable original/citation examples, failure recovery, editor observations and honest judging-criteria mapping. Qualified source/rights review remains distinct from software acceptance.                                                               | #4/#18/#21/#22/#27 |

The JSON source policy controls discovery; newly acquired pages may be classified
and retained in the separate pending research cache after admission checks. A
classifier label, allowed domain, provider HTTP success or checksum does not
approve an edition or its religious interpretation. Approved-source production
retrieval remains a separate acceptance requirement.

## Merge and testing order

PR #59 supplies the foundation. Review the bounded follow-ups in dependency order:
#70 expansion plan, #71 staging routing, #72 original-span claims/passages, #73
layout/citation action, #74 batch compiler/corpus pilot, #75 source-quality guard
and #76 substantive rewrite including its modality follow-up, then #77 claim
recovery and #78 routing evidence/priority plan. New passage indexing is being
implemented independently under #8; it needs its own review and isolated
migration/retrieval evidence. Preserve merge commits; no squash, rebase or force-push.
PRs and issue acceptance remain open until Saleh acts. CI success does not imply
deployment or scientific acceptance.

Local tests may merge reviewed feature branches into an isolated integration
checkout without changing development or the primary checkout. Paid public-text
provider testing and isolated Neon research activation are authorized. Production
migrations/releases and merge authority are not granted by local test success.

## Judging alignment and evidence gaps

| Criterion         | Weight | Useful current evidence                                                                          | Missing proof                                                              |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Technical quality | 25%    | Persisted integrated review, exact originals/citations, hosted retrieval, bounded rewrite and CI | Accepted online end-to-end run and release QA                              |
| Reliability       | 15%    | Provider outage abstention, cancellation, identity guards and retained failed trials             | Representative adjudicated semantic reliability                            |
| Innovation        | 15%    | Separate quotation/excerpt extent and evidence sufficiency; auditable claim/source routing       | Measured gain over a specified baseline; stronger-model advantage unproven |
| User experience   | 10%    | Arabic long-writing result cards, exact comparison and before/after rewrite                      | Editor observations and accessibility acceptance                           |
| Impact            | 20%    | Clear short-post editorial use case                                                              | Measured benefit to real editors/beneficiaries                             |
| Operations        | 10%    | Versioned Neon research corpus/cache and default-off deployment configuration                    | Accepted staging configuration and operational demonstration               |
| Presentation      | 5%     | Reproducible evidence and transparent limitations                                                | Finished demo narrative and committee handoff                              |

Weights are the supplied final-stage criteria recorded in the foundation review,
not scores awarded to the project. Avoid describing schema tests, selected-case
agreement or machine-verifier approval as scholarly reliability or user impact.
