# Selected qualifier-field consistency comparison

Related to [#13](https://github.com/smaq777/Basira-Hackathon/issues/13) and
[#18](https://github.com/smaq777/Basira-Hackathon/issues/18).

## Problem and production boundary

A retained supported finding had correct negations and explanation, but its scope
was a bare Arabic topic phrase that omitted the negation. Reading scope alone could
therefore suggest the action that the finding denied. This is a field-presentation
consistency concern; it does not establish that the supported relation or correctly
qualified explanation was reversed.

Prompt/pipeline v1.10 appends the tested instruction: scope items must state a
self-contained bounded Arabic proposition with affirmation or negation, material
conditions, exceptions and modality. Scope, conditions, negations, exceptions and
explanation must agree. Contradicted or unestablished author propositions must be
identified as such; ambiguous or unavailable evidence must retain the limitation.
The instruction does not require support or change relation meanings.

Claim extraction aliases, source selection, immutable text/hash/span bindings,
citation checks and schema fields are unchanged. No keyword-based verdict rule or
automatic textual repair was added. Matching historical prompt/pipeline versions
through v1.9 remain readable; mixed-version traces remain invalid. Existing reports
are not rewritten. The production v1.10 version tag is additive; its separate live
behavior has not been replayed merely to confirm this source change.

## Frozen comparison and all outcomes

The experiment used accepted source `06031c79f0857a6bd5b9bf6f7da3a74b6ec4c640`,
the current production response schema/envelope and actual production citation
validator. Six declared public/synthetic controls were partitioned once into two
packets of three, respecting the unchanged maximum-five production contract. Both
arms used the same immutable packets, owned claim identities, exact original
passages and pinned `openai/gpt-6.1-sol` / OpenAI-only route, configured medium,
7,000 output tokens, 60-second request bound and no fallback or retries.

Extraction was locally fixed through the real C/E-to-canonical resolver. No paid
extraction, retrieval, source acquisition, embeddings or SQL operations occurred.
Each arm received both packets twice: eight paid assessment attempts, all eight
structurally completed, with 24 retained raw assessments. Recorded response cost
was **$0.1101732**, with zero missing-cost outcomes. Reported reasoning-token counts
were zero in all eight calls despite the configured medium setting; this is not
evidence of stronger reasoning or model superiority. Observed cell durations were
13.17–16.13 seconds; these are selected samples, not a service guarantee.

The only request difference between arms was the appended instruction. During this
external experiment the unchanged adapter computed its trace request hash before
the candidate instruction was appended in the fetch wrapper. Frozen request files
and each cell's `transmittedRequestSha256` bind the actual sent body separately;
the adapter trace remains unchanged. Candidate cells are external experimental
outcomes, not historical production v1.10 reports.

| Control                                             | Relation in both arms/repeats | Per-case scope reading                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conditional lawful covenant                         | supported                     | Baseline scope names a class of covenants. Candidate explicitly includes obligation and the lawful-source condition.                                                        |
| Negated obedience with companionship                | supported                     | Baseline scopes omit negation in a topic phrase. Candidate explicitly states non-obedience in sin and lawful companionship.                                                 |
| Author proposition requiring obedience in sin       | contradicted                  | Candidate expressly labels the author proposition contrary to the supplied source rather than silently correcting or endorsing it.                                          |
| Conditional obligation plus universal wealth clause | not_established               | Candidate distinguishes the supported clause from the unestablished wealth claim. Baseline second-repeat scope states the wealth claim without its unestablished qualifier. |
| Ambiguous pronoun/request reference                 | insufficient_context          | Both arms abstain. Candidate scope explicitly describes the assessment limitation without inventing an antecedent.                                                          |
| No evidence allocated to the claim                  | insufficient_context          | Both arms abstain without borrowing other claims' sources. Candidate scope preserves the negative proposition and unavailable-evidence limitation.                          |

These observations come from reading each complete returned finding, exact cited
excerpt and packet, not keyword scoring. All six relations were stable across
arms/repeats; no relation advantage was demonstrated. Citation arrays were stable
across repeats within each arm. Full finding wording was identical in zero of six
per-arm repeat pairs; scope wording and categorical placement still varied. One
baseline compound scope contained mixed English (`supplied`). The selected candidate
outputs do not establish general Arabic quality or reliable qualifier preservation.

## Reproducibility and limits

External artifacts are retained under
`AI_Foundation/experiments/qualifier-field-consistency-2026-10-05`:

- `PROTOCOL_FROZEN_V2.json`, SHA-256 `e28021d6be92133940b234bdd9ff2abd437be89f66442e0e0e0af141ae08ccb0`, binds 89 source/input/harness files.
- `REQUEST_{A,B}_{baseline,candidate}_V2.json` preserves the four exact request bodies; eight `CELL_*_V2.json` files preserve all first final outputs, hashes, usage and validation outcomes.
- `ALL_OUTCOME_TEXT_REVIEW_V1.json` retains all 24 findings and per-case review; `PAID_SUMMARY_V2.json` retains all cost/latency outcomes.
- Eleven zero-provider harness controls verify production schema/model/provider, source/excerpt, missing/duplicate claim, no-evidence rejection, request parity and allowance of extra envelope metadata.

The incompatible initial six-claim/single-packet proposal and the initial strict
runtime-schema capture failure remain preserved. Manifest-only rights/search-view
metadata stays in frozen external inputs but is explicitly projected out of strict
runtime SourceEvidence. Text, source hashes and provenance remain bound. Automatic
approval initially rejected execution before process creation; the lead supplied
previous direct human public-model authorization, and the unchanged invocation was
approved and run once. No rejected invocation produced a paid attempt.

The controls were selected and prompted engineering cases, not scholarly gold or
unseen accuracy. The negated obedience control uses a declared two-parent packet;
it does not reconstruct the historical 13-source UI run. Known batching, repeat
variability, source approval and broader language/calibration limitations remain.
No hosting, Rewrite UI, ingestion, schema, environment or deployment changes are
included. Owner acceptance remains separate; rollback is a source revert with
historical trace readability retained.

## Implementation checks and inherited gate

The implementation preserves the accepted owner changes with a merge commit from
`f7c7028cb41508fe42baac74d5d5b01a1412f8f1`; it does not edit hosting files or their
tests. Focused semantic/contract tests pass (two files / 119 tests), including the
v1.10 request instruction/version, immutable packet preservation, existing negative
and malformed-citation guards, all historical v1.1–v1.9 trace pairs and rejection of
mixed-version pairs. These transport regressions do not independently prove model
language correctness.

The full aggregate check at integrated `a976bdee285ce64e72264b33458772b3b4f3d0ef`
ran 808 tests: 807 passed and one inherited hosting test failed at
`tests/foundation-activation.test.ts:116`. It still expects the hosted demo to reject
flags that accepted owner hosting changes now permit. The test and hosting source
match owner development; neither was altered to hide the failure. Full quality was
therefore **not green at that check**, pending owner reconciliation of that hosting contract.
TypeScript passes. Independent documentation (95 Markdown files), policy,
formatting, build and 51 offline Python tests pass. The existing large-bundle build
warning remains. Initial sandbox Git-subprocess restrictions on docs/policy were
resolved with scoped local execution; their successful logs remain separate.

A later owner update, accepted PR #139 at
`caf56ff0963b834c66e5dd043beb83ae09a15c8c`, reconciled the hosted activation test
and added exact Quran-reference routing. This branch preserves that update with
merge commit `8781e3b66d87d85794535c99bd31cab4bc8723ec`; it does not independently
change those owner paths. The new full aggregate check passes **56 files / 812
tests**, TypeScript, documentation, policy, formatting and build. The earlier
807/1 failure log remains retained as `IMPLEMENTATION_FULL_CHECK_V1.log`; the
successful check is separately retained as `IMPLEMENTATION_FULL_CHECK_V2.log`.
The unchanged offline Python suite previously passed 51 tests. No additional paid
assessment was made for the owner merge or evidence amendment.
