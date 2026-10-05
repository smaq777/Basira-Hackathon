# Source-free claim-selection recovery

Related to [#11](https://github.com/smaq777/Basira-Hackathon/issues/11).
Local default-off research improvement; no deployment or scholarly acceptance.

The actual public UI statement below produced a valid empty model selection,
`partial/no_claims_extracted`, despite a complete deterministic author candidate.
Retrieval could not run because it had no selected assertion to search.

> الحديث الضعيف درجات، فمنه ضعف محتمل يمكن أن ينجبر بتعدد الطرق، ومنه ضعف شديد لا ينجبر بمجرد ذلك.

A fast actual-adapter replay reproduced that omission: the regression expected a
model-selected recovered span and failed with an empty claim array. The fixture
replays the recorded empty-selection outcome; it does not claim a fresh provider
response was observed during the deterministic test.

## Frozen actual-provider diagnostic

Before implementation, eight fresh pinned Luna low calls crossed the current
and clarified selection prompts with empty evidence and the complete public
Binbaz article «أنواع الحديث الضعيف», two repeats per cell. All eight selected
the exact original assertion and passed candidate/source-key validation.
This did **not** reproduce the original stochastic omission or establish that
missing evidence or the hadith-grading prohibition caused it. It does not show
statistical prompt superiority. Selection is a speech-act diagnostic, not an
assessment of religious correctness, narrator reliability or hadith authenticity.
No web retrieval changed any packet between calls.

## Bounded change

Semantic v1.8 explicitly separates selecting an assertion from evaluating its
support. An empty/unrelated evidence manifest permits `evidenceKeys:[]`; a general
methodology statement is not a request to independently grade a particular
hadith. Questions, greetings, quotations, source framing and reviewer requests
remain excluded.

After a valid empty selection with remaining inventory candidates, the adapter
may ask the same approved extractor to independently reconsider once. It never
promotes every sentence or a deterministic candidate automatically. Both
selection requests share the existing extraction phase deadline and the overall
deadline. Less than one second of extraction time remaining skips recovery.
Recovery has no additional supplier fallback; existing initial/assessment
fallback remains bounded. Malformed candidate IDs or evidence keys still fail
the unchanged resolver. A second empty result remains partial with explicit
unselected coverage; an outage remains unavailable without a content verdict.

The trace records `recovered`, `still_empty`, `budget_skipped` or `failed`, and
every request's hash, duration, route, outcome and available cost. The maximum
request trace increases from four to five for the one new bounded selection call;
source, citation, span, claim-count and support rules are unchanged. Historical
v1.7 reports remain readable alongside v1.8.

## Patched provider and control checks

A second frozen diagnostic used two deterministic replays of the original empty
selection followed by fresh actual-provider recovery calls. The first hit a
connection/provider failure and remained unavailable with zero claims and no
retrieval. The second selected the exact assertion, reached a separately labelled
deterministic frozen-source retrieval adapter and produced a strictly valid
provisional supported assessment. The retrieval adapter returned the preselected
public Binbaz original; this was **not** a measured hosted search or retrieval
accuracy test, and the original empty response was simulated, not paid twice.
Failed calls remain in the denominator and were not retried.

One completely fresh source-free run selected the assertion and returned
`insufficient_context` without evidence. A greeting remained unselected after
both model requests; a plain question and classified quotation-only input were
`not_applicable` with no model calls. These are selected engineering controls,
not scholar-reviewed gold or unseen accuracy. External frozen protocols, requests,
final responses and traces are retained in `claim-selection-2026-10-05`.
No keys, cookies, authorization headers or private reasoning are stored.

Targeted regressions cover recovered exact spans, still-empty/greeting
abstention, question/quotation exclusion, shared phase-budget exhaustion and
fabricated recovery IDs. Existing semantic passage and report-binding checks
remain applicable. The deterministic red test passed after the bounded change;
focused validation passed 4 files / 103 tests. Full `npm run check` passed
43 files / 582 tests, typecheck, documentation, policy, formatting and build.
The eight original diagnostic calls cost $0.000892835; patched controls made
seven provider attempts (six responses and one connection failure), with
$0.001051 in reported response costs. The failed attempt has unknown billing;
the known combined cost is $0.001943835, not a complete billing reconciliation.

Limits: model selection remains provisional and may still omit assertions.
Successful re-selection cannot supply missing sources or establish support.
This improvement makes an omission recoverable within a bound, not deterministic
or complete. Rollback is the v1.8 implementation commit; retain the v1.7 reader
entries when disabling the new path.

## Independent review follow-up

The lead reviewed the bounded request/deadline, resolver and historical-version
changes. A valid empty selection now has a distinct Arabic UI explanation:
`لم يُحسم تحديد الادعاءات`, with possible unreviewed coverage and retained source
comparison. It is not described as a provider outage, an assertion-free text or
a correctness judgment. Actual service failures retain their separate message.
A rendered regression verifies this distinction while preserving quotation
results. This follow-up is separate from the original 582-test implementation run.
