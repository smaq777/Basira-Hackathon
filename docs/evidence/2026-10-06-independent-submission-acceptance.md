# Independent submission acceptance and provider failure

Related to [#165](https://github.com/smaq777/Basira-Hackathon/issues/165),
[#157](https://github.com/smaq777/Basira-Hackathon/issues/157) and
[Saleh's capacity handoff #169](https://github.com/smaq777/Basira-Hackathon/issues/169).

## Inspected release

The owner reports accepted development
`9838bc285065c7e6301baf5ae2800c85950f9d80` at Railway staging deployment
`1210e112-1772-4a46-9b05-57371d65ad32`, with successful
[merge CI](https://github.com/smaq777/Basira-Hackathon/actions/runs/37447216800).
See the [owner handoff](https://github.com/smaq777/Basira-Hackathon/issues/157#issuecomment-6014024837).
The independent fresh reports below select the 175-passage corpus
`7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`,
`evidence-support-v1.13` and `provisional-semantic-v1.13`.

This is staging evidence for selected synthetic cases, not general accuracy,
scholarly approval, production promotion or a submission-portal receipt.
Reviewer/publication/email and mobile acceptance remain deferred.

## First fresh outcomes

The run ended at 2026-10-06 10:08:44 UTC. Every original/revision/version binding,
saved-report reload equality and anonymous401 check passed under the existing
harness. Five semantic cases completed; the sixth encountered a provider failure.
The original six-pass receipt is retained, not relabeled or overwritten.

| Case                                        | Review ID                              | Observed semantic outcome                                                                                   |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 7:31 prohibition of excess                  | `b61a420f-f6f0-40c0-a8f4-f69195a41099` | Completed, supported; explicit prohibition retained                                                         |
| 7:31 endorsement of excess                  | `cd7a7df3-bd0a-431b-91fe-59f76805b97f` | Completed, contradicted; scope identifies the incompatible author proposition                               |
| 2:271 hiding charity and giving to the poor | `28ace029-a42b-46aa-aec0-495167ff4a8e` | Completed, supported; both conditions retained with exact Tafsir citations                                  |
| 4:29 trade without mutual consent           | `ab0eb88f-d636-4fac-919b-e7f079fae1ab` | Completed, contradicted; quotation matches while conclusion conflicts                                       |
| Wedding-feast/narration request             | `bf781e43-3c64-40d4-a67b-bd0090461a6a` | Completed, insufficient_context; no evidence or citations, no marriage-theme substitute                     |
| Office file management                      | `25df0df2-64c0-4d74-807e-631af0b45ab5` | Unavailable, gateway_blocked HTTP403; zero evidence/citations is safe failure, not completed classification |

The wedding explanation is grounded Arabic and names the unavailable original
claim. The supported charity scope limits the comparison to concealment versus
disclosure while giving to the poor; it does not imply superiority over all
charitable projects. These observations do not establish correctness outside
the selected supplied sources and cases.

Reports remain in ignored
`test-results/submission-acceptance-2026-10-06T10-06-39.780Z` in the acceptance
worktree. The receipt's SHA256 is
`7a631ba9d38efd82af1c39f69657ef98db49067ff59a315f06c1e8979dfff5be`.
The recorded script invocation used Node22 for this built-in-only live runner;
offline source checks use the required Node24/npm11. No source approval,
notification or publication was performed.

## Provider and UI limits

The off-topic extraction request records HTTP403 in106ms, no provider response
ID and no usage receipt. A separate fresh synthetic charity browser review
`3e42f1e8-764b-4e1e-ba06-48dfae05118c` showed unavailable semantic assessment,
the unchanged original, a clear partial-report limitation and no rewrite candidate.
Its exact provider error body is not available from the UI. The external audit
retains `final-charity-partial-ui.png`.

Separately, the locally configured owning Foundation OpenRouter key returned
HTTP403 `Key limit exceeded (total limit)` on the first synthetic public-source
author-generation probe. No generated operations or verifier calls occurred.
That local response does not prove staging uses the same key or quota. Saleh must
inspect his configured account privately under #169; no credential values,
spending-limit changes or alternate credentials were used here. Non-retryable
provider refusals were not retried until green.

The owner previously demonstrated exact faithful quotation-only attribution/copy,
changed2:271 word detection and cancellation. His supported-author charity output
was withheld in two live attempts. None of those observations establish a useful
accepted author rewrite; that remains a release gate under #157.

## Corrected acceptance gate

The old off-topic assertion inspected only empty evidence and allowed unavailable
semantics to pass. The corrected harness accepts completed explicit
`not_applicable`, deterministic `not_applicable`, or inconclusive empty selection
only with `no_claims_extracted` and successful extraction receipts. It rejects
disabled, unavailable and provider-error partial outcomes, while retaining the
first report. Valid empty selection remains labeled inconclusive, not a completed
religious classification. Tests reproduce HTTP403 without network calls.

After Saleh restores provider capacity, run one fresh off-topic case and one
supported-author generation/verification/copy case. Preserve first outcomes,
quotation, condition, modality and server copy checks. A code fix or successful
deploy alone cannot close this acceptance.

## Offline fix validation

The new harness regressions first reproduced five false-positive failures under
the old assertion. After the fix, all25 harness tests passed, including valid
empty selection, completed abstention, provider403, malformed extraction,
version/identity mismatches, reload and anonymous denial. A separate network-free
replay of the actual retained403 report changed the harness outcome from exit0
to exit1 with `OFF_TOPIC_SEMANTIC_UNAVAILABLE`; it started exactly one mocked
review and performed no provider call. The original live receipt remains intact.

Full Node24.19.0/npm11.21.0 `npm run check` passed:907 tests across64 files,
typecheck, documentation links across107 Markdown files, bounded policy,
formatting and builds. The existing large-web-bundle warning remains. This
change does not repair an external account quota or establish live post-fix
author rewriting. Fresh owner-deployed acceptance is still required.

## Recorded operational cost

The five completed reviews record15 successful model calls totaling
**$0.034495375** in gateway-reported cost. The403 request has no usage/cost
receipt; its charge is unknown. These figures exclude embeddings, MCP, hosting
and unrecorded failed-call charges.

| Case                   | Successful model calls | Recorded cost (USD) | Sum of recorded model durations (ms) |
| ---------------------- | ---------------------- | ------------------- | ------------------------------------ |
| Supported negation     | 3                      | 0.005205            | 11670                                |
| Contradicted negation  | 3                      | 0.0059953           | 10632                                |
| Supported condition    | 3                      | 0.00993795          | 14420                                |
| Contradicted condition | 3                      | 0.009610125         | 13040                                |
| Unavailable narration  | 3                      | 0.003747            | 11282                                |

Model-duration sums are not end-to-end review latency; no wall-clock latency
benchmark is claimed. The external audit retains `final-1.13-model-costs.json`.
Actual editor improvement against a timed manual baseline, useful author rewrite,
additional scientific review and final media/portal receipts remain pending.
