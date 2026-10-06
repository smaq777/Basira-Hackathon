# Testing and scientific evaluation

## Separate quality gates

1. **Software gate:** types, deterministic contracts, HTTP behavior, dependency audit and documentation/policy checks.
2. **Integration gate:** verified provider schemas, permitted access, real failure handling and database isolation.
3. **Scientific gate:** independently reviewed source selection and claim/evidence judgments on a frozen evaluation set.
4. **Product gate:** complete Arabic user journey, accessibility, privacy and deploy/recovery verification.
5. **Acceptance gate:** owner review and committee-ready artifacts.

Passing the software gate does not satisfy the other four. CI has no paid provider secrets and does not evaluate religious correctness.

## Current automated coverage

`tests/contracts.test.ts` checks schema strictness, evidence identifiers, revision linkage, bounded retrieval normalization, automatic claim extraction, deterministic quotation/attribution comparison, provider failure classification and embedding compatibility. Quotation fixtures cover exact text, limited diacritic/punctuation differences, negation, omitted conditions, ellipsis, wrong reference and missing attribution. `tests/retrieval.test.ts` covers approved-source filtering, exact-reference priority, Arabic lexical ranking, optional semantic-score fusion, context identifiers and Recall@k with synthetic passages. `tests/api.test.ts` checks foundation HTTP liveness, automatic owned-revision extraction, owned review-run lifecycle behavior, honest capability reporting, security headers, burst limits and deletion availability. `apps/web/src/App.test.tsx` covers empty input, automatic analysis without a classification dropdown, reviewer navigation and states, safe long-result rendering, copy recovery and bounded voice behavior. These tests are software fixtures, not an approved scholarly gold dataset.

The dated [security and mobile verification record](../evidence/2026-10-03-security-mobile.md)
captures the current public same-origin staging walkthrough, responsive checks and explicit limits.

The failure classifier does not implement actual retries or a circuit breaker. The quotation comparator deliberately performs only conservative formatting comparison; it does not establish authenticity or substantive claim support. The evidence guard checks structure/identifiers; it cannot determine whether a passage substantively supports a claim.

## Planned 60-case evaluation

The [case catalogue](CASES.md) contains **planned test specifications**, not 60 completed experiments. Prepare development cases separately, then have an appropriately qualified content reviewer approve held-out cases and expected evidence/labels. Record reviewer role, rubric, disagreements and adjudication without exposing private personal details.

For a compact domain evaluation, balance supported claims, the three reasoning-error categories, quotation/attribution errors, and insufficient/out-of-scope cases. Include difficult counterexamples: an accurate quote with an unsupported inference; a formatting difference without changed meaning; unavailable evidence that must not produce a false verdict.

## Metrics and baselines

| Metric                               | Definition / reporting requirement                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Quotation precision/recall/F1        | Compare against reviewer-labeled quote errors; report normalization policy                       |
| Retrieval Recall@5                   | Proportion of labeled relevant evidence recovered in the top five candidates                     |
| Support-category precision/recall/F1 | Per-class and macro results; publish confusion matrix and sample counts                          |
| Citation validity                    | Resolvable source/edition/passage links; separate validity from actual entailment                |
| Unsupported determination rate       | Concrete conclusions lacking reviewer-confirmed support                                          |
| Abstention quality                   | Coverage and errors among answered cases; unsafe confident answers versus appropriate abstention |
| Editor review time                   | Paired/counterbalanced task timing against manual search, with identical task scope              |
| Operational metrics                  | Median and p95 latency, failed runs, model tokens and cost per completed review                  |

Compare against manual source search and a general-purpose model baseline with documented prompt, version, source access and time budget. Do not favor Basirah with extra evidence while hiding that difference. Repeat stochastic runs where feasible, log seeds/settings if available and report uncertainty for a small sample.

## Release thresholds

Hard gates: zero unresolved invented citations, zero accepted stale-revision findings, zero cross-session data leaks, no outage misreported as a false-content verdict, and no unapproved reference work in the demo. These are gates to test, not observed current product scores.

Choose numeric task-performance and latency thresholds before running the held-out evaluation, after a small development pilot and content-reviewer agreement. Do not tune thresholds to make the final run pass. Critical failures block the affected feature even if aggregate accuracy looks good.

## Failure evidence

For each defect record case ID, revision, source/corpus/model/prompt versions, expected and observed outputs, sanitized trace, impact and fix. Re-run the affected regression set after changes. Do not commit raw user posts or model hidden chain-of-thought.
