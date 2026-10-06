# Quotation-only rewrite attribution follow-up

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157).
Scope: submission staging; reviewer publication and corpus activation are separate.

## Observed issue and correction

The 6 October live audit retained a faithful quotation-only browser rewrite that
failed with `invalid_candidate`, alongside a successful supported-author rewrite
and exact server copy. The historical failed provider output was not retained,
so its exact rejection reason cannot be established retrospectively.

Inspection found that quotation-only reports used the supported-author generator
despite having no author spans. Its contract permitted an empty operation set,
which the hosted complete-evidence gate correctly withheld. This introduced an
unnecessary model decision into exact citation attribution.

For a hosted report that passes the existing complete-evidence gate and has zero
selected/eligible author claims, the server now constructs quotation citations
from its exact allowed offsets and evidence keys. It selects at most one citation
per offset, up to the existing twelve-operation limit, within the 3,000 UTF-16
unit budget. It adds no paragraph breaks or replacements. The candidate mode is
`citation_and_layout_only`; no author generator or verifier request is needed.

The original quotation and all other characters remain unchanged. Revoked,
rejected, altered, unsupported, unreviewed, stale and attribution-free cases
remain gated. Fresh report reload, ownership, cancellation, immutable report/
attempt binding and server copy revalidation remain in force. A citation that
cannot fit still produces no copyable candidate. Supported-author candidates
continue to require the existing separate source/meaning verifier, including
condition, negation, exception, scope and modality checks.

## Validation

Targeted API/service/author-verifier/UI checks passed: four files, 43 tests.
The required `npm run check` passed on Node 24.19.0 with exact locked
dependencies: 62 files/861 tests, TypeScript, documentation links, policy,
formatting and API/web builds. `npm ci` reported zero dependency vulnerabilities.
The web build retains the existing large-chunk advisory.
New regressions verify model-free faithful attribution, original preservation,
exact copy, foreign-owner denial, stale-attempt denial, no-room withholding and
stale reload withholding. Existing provider outage, deadline, cancellation and
negative preservation checks remain passing.

An offline replay used the retained real Railway reports from the earlier audit:

| Retained report                                                                          | Changed implementation result                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Faithful Quran 2:271 excerpt, `26218bce-079b-470f-b853-a6f340aa0a7e`                     | Validated exact recorded Quran citation at original offset 76; every original character preserved; exact copy; foreign and stale copy denied; zero provider calls. |
| Altered Quran excerpt                                                                    | Rejected before generation with `REWRITE_EVIDENCE_REQUIRED`.                                                                                                       |
| Contradicted author claim                                                                | Rejected before generation with `REWRITE_EVIDENCE_REQUIRED`.                                                                                                       |
| Unresolved hadith                                                                        | Rejected before generation with `REWRITE_EVIDENCE_REQUIRED`.                                                                                                       |
| Unrelated writing                                                                        | Rejected before generation with `REWRITE_EVIDENCE_REQUIRED`.                                                                                                       |
| Previously successful supported-author candidate, `41c3ceae-f8f1-429c-b03e-e2aaf863f5af` | Exact retained replacement/citation operations still accepted deterministically and reconstruct the retained text. The model verifier was not rerun.               |

Raw offline receipts are retained outside Git under the owning Foundation
experiment directory, `submission-audit-2026-10-06/rewrite-fix-offline-replay.json`.
This replay used frozen live inputs, with no new provider, retrieval, deployment
or approval changes. It does not establish new live deployment acceptance or
general model preservation accuracy. The changed Railway release still requires
a fresh browser quotation-only generation/copy and supported-author acceptance.

Rollback: revert the bounded attribution change, or disable the staging rewrite
flag. No schema, source approval, corpus or production changes are included.
