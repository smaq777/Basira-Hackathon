# Product requirements

**Stage:** approved direction; implementation acceptance is pending. Basirah helps Arabic Islamic-content editors review a short post before publication. The distinctive question is not only “Is this quotation accurate?” but “Does this evidence support the conclusion written here?”

## Target user and job

An editor pastes a draft, confirms extracted claims, examines attributable evidence and revises unsupported wording. A reviewer receives a compact unresolved-case package when the system cannot determine support. The user remains responsible for publication.

Initial scope: one Arabic post per run; provisional maximum 3,000 characters and five claims; 30–50 approved reference passages. These are engineering limits to validate, not established coverage claims.

| ID    | Requirement                                                            | Acceptance evidence                                                            |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| FR-01 | Accept short Arabic text and reject empty/oversized input              | Input-boundary tests and Arabic UI walkthrough                                 |
| FR-02 | Extract claims, quotes and references; ask the editor to confirm them  | Exact source spans remain traceable after confirmation                         |
| FR-03 | Retrieve only from approved source editions                            | Unknown/withdrawn source excluded; source/version displayed                    |
| FR-04 | Separate quotation comparison from claim-support assessment            | Accurate quote can coexist with unsupported inference                          |
| FR-05 | Detect the three bounded reasoning-error categories                    | Expert-reviewed gold cases and error analysis                                  |
| FR-06 | Attach evidence to each finding                                        | Every concrete determination has resolvable passage IDs and displayed excerpts |
| FR-07 | Offer an editorial revision without fabricating a quotation            | Original quote unchanged; new wording rechecked                                |
| FR-08 | Bind every run to an immutable document revision                       | Stale findings cannot appear as current results                                |
| FR-09 | Abstain for insufficient evidence, disagreement or unavailable sources | No provider outage becomes a false-content verdict                             |
| FR-10 | Export a human-review packet                                           | Original, claims, evidence, limitations and unresolved questions included      |
| FR-11 | Protect and delete guest sessions                                      | Ownership, expiration and deletion tests                                       |
| FR-12 | Communicate progress and degraded operation                            | Partial results and failure reasons remain explicit                            |

## Non-functional requirements

- **Reliability:** bounded retries, timeouts, circuit breaker and equivalent-source fallback; no silent evidence replacement.
- **Reproducibility:** record model/version, prompt version, source edition, corpus version, parameters and request/run IDs.
- **Accessibility:** RTL layouts, keyboard navigation, visible focus, readable Arabic, semantic status text and no color-only verdicts; target WCAG 2.2 AA verification.
- **Privacy:** minimal guest data and disclosed provider processing; see [security](../../SECURITY.md).
- **Observability:** operational latency, error category and token/cost metadata without post content in logs.
- **Performance:** measure retrieval, model and total latency separately; set release targets after a representative pilot. No invented current performance claims.

## Explicit exclusions

No unrestricted Islamic question-answering, personal fatwas, independent hadith grading, “Islamically approved” publication badge, judgment of individuals, automated publishing, or live scholar availability promise. Accounts, OCR, audio, unrestricted chat, institutional dashboard and multilingual expansion are later work.

## Definition of product readiness

The scaffold is not the product. Readiness requires the end-to-end journey, approved/licensed corpus, source adapters or disclosed local reference mode, independent scientific review, evaluation report, privacy controls and an accessible demo. The [test strategy](../testing/STRATEGY.md) defines separate software and scientific gates.
