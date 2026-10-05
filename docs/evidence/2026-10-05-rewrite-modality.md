# Rewrite modality preservation follow-up

Related to [#38](https://github.com/smaq777/Basira-Hackathon/issues/38).
The feature remains optional, default off and provisional; this does not approve
publication or establish scholar-reviewed correctness.

## Recorded false acceptance

The live UI generated and independently accepted this wording for a supported
author span:

> إذا أمر الوالدان بمعصية من معاصي الله، فلا نطيعهما فيها، ولكن نصاحبهما في الدنيا بالمعروف فيما لا إثم فيه.

The original author said `ما لازم نطيعهم` (not required) and
`لازم انه نصاحبهم` (required). The candidate potentially turned absence of
obligation into prohibition/refusal and lost the explicit companionship
obligation. Quote fidelity and source support did not establish mutual meaning
preservation. The recorded UI acceptance is retained as a potential preservation failure
diagnostic, not described as an unquestioned success.

## Bounded correction

Generator and verifier now use `supported-author-wording-v2`. Verifier schema
version 2 requires an additional `modalityPreserved` boolean; missing, false or
malformed output rejects validated copy, even when all older checks are true.
Generation and independent verification explicitly distinguish obligation,
prohibition, permission, recommendation, possibility, certainty and absence of
obligation. The author wording determines modality; the source or prior support
finding cannot silently replace it with a preferred ruling. Equivalent Arabic
wording is allowed without literal modal-word matching. Ambiguous colloquial
interpretations require abstention. Existing quote, scope, source identity,
ownership, report, cancellation, deadline and copy bindings remain intact.

This new verdict is a model guard, not a deterministic semantic proof. Both
requests still use pinned Luna low; no stronger-model advantage was established
by the prior fixed-packet comparison.

## Frozen paid diagnostic

Before calls, the complete successful Quran/Muyassar 31:15 research packet from
the earlier assay was frozen, including original author context and current86
source identities. Four predetermined candidates were tested twice with the same
input and prompt; no new web retrieval, retries or response salvage occurred:

| Candidate                                    | Observed outcome |
| -------------------------------------------- | ---------------- |
| Explicit `فلا يلزمنا ... يلزمنا أن نصاحبهما` | Accepted 2/2     |
| Actual UI candidate above                    | Rejected 2/2     |
| Only companionship obligation removed        | Rejected 2/2     |
| Only not-required changed to `فلا يجوز`      | Rejected 2/2     |

All eight responses were schema-valid. Each negative verdict marked both
`meaningPreserved` and `modalityPreserved` false while `evidenceSupported` was
true. This illustrates why source entailment cannot substitute for preservation.
All responses remain in the denominator. Response-reported cost was $0.00291306.
Some explanations contain the English word `modal`; final texts and usage are
retained, without private reasoning contents or secrets.

An independent tools-disabled Claude consultation (`claude-sonnet-5-5`, configured
medium, zero reported thinking tokens) agreed that the two isolated modality
changes altered meaning. It judged the actual UI candidate equivalent while
acknowledging colloquial ambiguity and a possible mild modality shift. This
cross-model dissent is retained in `CLAUDE_LANGUAGE_REQUEST.json` and
`CLAUDE_LANGUAGE_RESULT.json` in the earlier substantive-rewrite experiment.
The stricter guard follows a conservative requirement for unambiguous preservation;
these models did not jointly establish a linguistic or scholarly gold verdict.

A separately frozen two-call generator/verifier run produced and validated:

> إذا أمر الوالدان بمعصية من معاصي الله، فلا يلزمنا طاعتهما فيها، لكن يلزمنا أن نصاحبهما في الدنيا بالمعروف فيما لا إثم فيه.

The reconstructed candidate preserves the exact quotation and remaining author
text. This is a direct actual-provider generation/verification diagnostic, not
a new UI or clipboard verification. Frozen protocols, requests, final responses,
failure slots, model/provider configuration and results are external in
`Project_Code/AI_Foundation/experiments/rewrite-modality-2026-10-05`.
The two calls cost $0.000934975 and took 6.638 seconds combined. After correcting
English grammar in the prompt, a separately frozen final two-call run again
generated explicit `فلا يلزمنا ... يلزمنا أن نصاحبهما` wording and validated it;
that run cost $0.0009861 and took 7.267 seconds. All twelve new attempts completed
with responses, with $0.004834135 in reported costs. Original protocol hashes and
request text retain the exact earlier prompt; `FINAL_E2E_PROTOCOL.json` binds the
final provider-module bytes. This does not include the parent's separate Claude
consultation or promise UI latency.

These are selected, known engineering cases with authored control expectations,
not scholarly gold, held-out accuracy or general reliable preservation. The
prompt directly addresses the recorded failure, and two repeats cannot establish
robustness across Arabic dialects or contexts. A later independent adjudicated
evaluation is still needed before broad release.

## Validation

A fast red regression demonstrated that the old verifier accepted all-positive
checks without a separate modality verdict. It passes after the contract/gate
change. Tests also reject a false modality check without exposing candidate text,
retain explicit generator/verifier instructions in the actual request, and check
schema version 2 and the required verdict. Full `npm run check` passed
42 files / 579 tests, typecheck, documentation, policy, formatting and build.
After the prompt grammar cleanup and consultation documentation, focused rewrite
checks passed 3 files / 28 tests and documentation links passed again.
Rollback is this follow-up commit; retained old receipts
continue to describe their original schema and outcomes.

## Independent integrity and UI recheck

The lead audit bound the final provider module to the frozen protocol, compared
raw final generation/verification text with validated artifacts, checked original
author spans, immutable source hashes and exact citations, and recomputed cost.
All integrity checks passed; this is not independent semantic adjudication.

After integration, full checks passed 44 files / 594 tests. The current UI loaded
retained supported report `e7ff2ea0-7d11-47e6-bcf5-f2f3cd4a6a23` and generated:

> إذا أمر الوالدان بمعصية من معاصي الله، فلا يلزمنا طاعتهما فيها، ولكن يلزمنا مصاحبتهما في الدنيا بالمعروف فيما لا إثم فيه.

The Ayah remained unchanged; the inserted citation visibly remained a research
source. Expanded before/after showed the explicit modality and the copy action
displayed its success message. Clipboard byte equality was not independently
verified. This uses an existing supported report and tests historical-report
compatibility plus current rewrite, not a fresh successful extraction.

A fresh mixed 31:15 report `79fe5e29-01ba-4efb-b71d-5a0d8ec5dc96` had separately
failed original-span selection validation and was retained without semantic
assessment. It did not authorize substantive rewrite. Screenshots, public test
text and report receipts remain external in
`AI_Foundation/experiments/integration-lead-v1` and
`AI_Foundation/experiments/broader-source-cache-2026-10-05`.
