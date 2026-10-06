# Result workspace redesign — Issue #145

## Scope

The result page is being recomposed around the existing persisted Foundation report and rewrite contracts. The change does not add a new verdict, source field, API request or database dependency.

## Functional mapping

| Owner-selected interface area | Existing report behavior used                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Attention summary             | `reportFindings()` groups literal findings as different, unresolved or faithful            |
| Comparison cards near the top | selected intake segment, bound evidence item, comparison extent and word-level differences |
| Original-text reading pane    | untouched `intake.originalText`, verified segments and typed highlight roles               |
| Evidence/analysis pane        | interpretation state, semantic claims, assessments and report-bound citations              |
| Selected-source pane          | current evidence selection, full source text and linked context records                    |
| Source table and filters      | the existing matched, candidate, context and additional source collections                 |
| Rewrite area                  | the existing capability-gated, report-bound generation, validation and copy flow           |
| Human review                  | existing material-review reasons and ticket-capability check                               |

The source table describes how a record is used in the report. It does not convert a candidate into a match, infer scholarly approval, or claim that a source establishes the author's conclusion.

## Presentation decisions

- Keep the active draft/reference comparison and three comparison-count cards at the top.
- Use a sticky section navigator on wide screens and a horizontally scrollable navigator on narrow screens.
- Open a requested disclosure automatically, scroll it into view and briefly highlight the destination.
- Stack the draft and reference cards on phone-sized screens without changing their reading order.
- Keep the original text, type legend, source filters and candidate-source distinctions intact.
- Keep full source text, linked context and comparison limits collapsed until requested.
- Preserve the existing semantic type legend and all partial/degraded explanations.

## Verification plan

- Targeted `foundation-report` and `rewrite` component tests.
- Full repository `npm run check` under the pinned Node/npm versions.
- Desktop and 480-CSS-pixel browser comparison with the owner-selected reference.
- Navigation, disclosure opening, destination highlighting and overflow checks in the in-app browser.
- Design QA record in `design-qa.md` before review handoff.

## Rollback

Revert the Issue #145 merge commit to restore the previous component order. No stored report, migration or API contract needs rollback.

## Live comparison follow-up

- Quotation selection supports all findings through a compact selector, not only the first item in each status group.
- The draft card remains present in source-reading and author-only report states.
- Semantic assessments now occupy a main-flow section. Selecting a claim or one of its citations places that exact claim and exact cited excerpt in the top comparison cards, together with the recorded assessment explanation.
- Literal word-difference highlights remain exclusive to report-bound quotation comparisons. Selecting an explanatory source or semantic claim does not inherit a quotation-match verdict.
- The result screen remounts its selection when review identity or evidence-state identity changes.
- RTL navigation, inline Arabic word marks and the card-header hierarchy were corrected without changing the API, provider settings or stored report contract.

### Staging receipt before deployment

The existing staging deployment was crashing with `HOSTED_DEMO_ENVIRONMENT_MISMATCH`: its declared deployment SHA still identified an older build. Aligning that nonsecret declaration with the already-deployed development merge restored the service. No database records or credentials were changed.

A real public test contained Quran 2:271 followed by the author's universal claim about hiding every charity. The saved report returned one normalized-faithful quotation, three sources, two tafsir contexts and a separate contradicted claim assessment with exact source excerpts. Reload restored the same report. The follow-up layout must be accepted against that persisted report, not a static mock.

The Edge screenshot showing draft capacity is a separate pre-analysis rejection. The current policy limits a session to 20 saved documents. It is not evidence that the completed report or the comparison rendering is still loading. The earlier unmerged quota-removal proposal was withdrawn under the owner's undo request; clarification is pending on that separate policy change.
