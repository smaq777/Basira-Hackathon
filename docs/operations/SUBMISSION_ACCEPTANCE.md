# Submission semantic acceptance

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157).
For tonight's bounded staging checks, retain semantic prompt
`evidence-support-v1.13` and pipeline `provisional-semantic-v1.13`. Versions 1.10–1.12
is historical compatibility, not the release target. The 175-passage corpus pin
is `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`.
Neither a green transport test nor a successful deployment proves that fresh
reports select this corpus.

## Bounded live check

After scoped authorization for these live model requests, run:

```sh
node scripts/acceptance-submission-staging.mjs --live
```

Use `--case=supported-negation` to run one named case. Without `--live`, the
script lists cases and exits without making requests. It targets only the known
Railway staging URL, creates synthetic expiring guest documents, and writes the
first reports and a receipt under ignored `test-results/submission-acceptance-*`. It never
retries a failed provider outcome, changes configuration, approves sources,
publishes reports or sends notifications. Reviewer/publication acceptance is
deferred and is not part of this command.

| Case                     | Expected selected outcome                            | Manual inspection                                                                                       |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `supported-negation`     | `supported`                                          | The prohibition of excess is explicit in explanation and scope.                                         |
| `contradicted-negation`  | `contradicted`                                       | Scope identifies the author's proposition as contradicted and does not endorse it.                      |
| `supported-condition`    | `supported`                                          | Hiding the charity **and giving it to the poor** remain linked; the source clause is cited verbatim.    |
| `contradicted-condition` | `contradicted`                                       | Mutual consent is material; dropping it cannot become supported.                                        |
| `unavailable-narration`  | `insufficient_context`                               | The explanation identifies the unavailable narration or attribution, with no thematic Quran substitute. |
| `off-topic`              | No evidence; empty findings or `not_applicable` only | Office file management does not become a religious judgment; no evidence keys or citations are allowed. |

Every case also checks the exact corpus/version pair, report reload and anonymous
report denial. A mismatch produces a failed receipt, not an automatic verdict
repair. The expected relations are selected engineering checks on supplied
evidence, not expert adjudication of general scholarly accuracy. Inspect the
saved Arabic conditions, negations, exceptions, scope, citations and explanation
together; JSON schema validity cannot prove semantic consistency.

For rewrite acceptance, use the supported cases with the current UI. Verify that
the original quotation, conjunction, condition and modality survive, cancellation
reveals no copyable candidate, and server copy equals the validated candidate.
Unsupported or unavailable-evidence reports must withhold rewriting. Retain
failed first outcomes along with successful ones; do not select only successes.

## Offline provider controls

```sh
npx vitest run tests/semantic-assessment.test.ts tests/semantic-relevance.test.ts tests/semantic-spans.test.ts tests/semantic-report-binding.test.ts
```

These deterministic fixtures exercise malformed/blocked responses, bounded
timeouts, one distinct fallback, missing evidence, topic-only candidate rejection,
verbatim citations, original condition spans and durable report binding. They
make no network requests. Historical v1.10–1.12 reports must stay readable, while a
mixed prompt/pipeline version pair remains invalid. Controlled provider failures
belong in these offline tests; do not inject an outage into shared staging.
