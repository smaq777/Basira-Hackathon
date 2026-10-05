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
