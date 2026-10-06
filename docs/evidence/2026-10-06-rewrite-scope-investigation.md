# Supported-author comparison rejection

Related: [#157](https://github.com/smaq777/Basira-Hackathon/issues/157) and
[#169](https://github.com/smaq777/Basira-Hackathon/issues/169).

## First captured outcome

A fresh local first attempt used the frozen public-source charity report and
accepted development `cb8e8e068418386f48b6fe426f4e72ed180d0949`. Both generator
and independent verifier returned HTTP 200 from OpenRouter/OpenAI Luna; no
Gemini fallback occurred. The candidate was withheld at
`verification_validation / meaning_changed`, with no reusable text or copy.
This was a local fixed-report provider test, not a new RAG query, Railway test,
or reconstruction of the earlier uncaptured UI failures.

The exact author assertion was
`إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق`.
The generator proposed
`يكون إخفاء الصدقة وإعطاؤها للفقراء خيرًا للمتصدق من إظهارها`.
The verifier returned `evidenceSupported:true`, `meaningPreserved:false`, and
`scopePreserved:false`, explaining that the proposed comparison was supported by
the supplied sources but not explicitly stated in the original author assertion.
This is a recorded conservative model judgment, not scholarly adjudication.
The captured data does not justify treating the veto as a false rejection.

The external receipt is
`AI_Foundation/experiments/submission-audit-2026-10-06/author-first-2026-10-06T14-09-34-475Z/trace.json`.
Operations SHA-256:
`754b2403fcdb0d67efa9c39d82fc0c616cef463cdb245f3dd903e2f0cc03042e`.
Verifier packet SHA-256:
`be2156931ce14d8a3069811698ab96b911dbf2cd675c23feaa6bf1e4dd6bc0c5`.
Raw provider packets remain outside Git; no credentials are included in this change.

## Reproduction and intervention

`replay-author-first-attempt.mts` replayed the exact captured envelopes through
the real provider parsers, hosted service, immutable report reloads and independent
verification gate. Its expectation of a validated candidate went red with the
same recorded stage/reason. Removing only the optional generated citation and
envelope metadata preserved the failure. The original and minimized receipts
remain separate. Removing the added comparison and reusing the previous verifier
packet would not establish semantic acceptance of a different proposal.

The leading testable explanation is that generation imported a comparative detail
from source evidence, or made an implicit comparison explicit. A false verifier
rejection remained a lower-ranked hypothesis; stale binding was contradicted by
the deterministic checks passing before verification. These hypotheses were
shared before changing instructions.

Generation alone now prepends policy `author-original-scope-v1`: source support
does not authorize adding source details, supplying an unstated comparand or
making an implicit comparison explicit. It prefers the smallest useful grammar
edit and an allowed safe skip with exact citations when no faithful improvement
is available. The existing shared prompt marker remains
`supported-author-wording-v2`; the verifier instruction is unchanged.

The provider request regression first failed on the absent generator policy.
After the change, it checks policy delivery and unchanged author/source input.
Controlled service regressions continue withholding source-supported proposals
when either meaning or scope fails, and assert no provider opinion replacement
or copy. A safe-skip control preserves original wording, exposes attribution-only
mode, and copies the reconstructed result without a verifier request. These are
software controls, not proof of model semantics or improved acceptance rates.

The focused suite passed 91 tests in five files. The full Node 24/npm 11 check
passed 1,037 tests in 71 files, TypeScript, documentation links across 113 Markdown
files, bounded policy, formatting and production build. The existing bundle-size
warning remains. No provider calls are included in these default checks.

The captured unsafe proposal must continue failing when replayed after this
instruction change. No invalid-output retry, verifier override, citation repair,
source replacement, database change, UI redesign or production activation is added.

## Acceptance and rollback

Three fresh bounded changed-policy cases were retained separately. Each used
actual providers and the same server validation/copy path; none was a Railway
browser test or a fresh RAG query.

| Case                                         | Actual result                                             | Boundary evidence                                                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same clear charity assertion                 | `citation_and_layout_only`, zero replacements, exact copy | OpenRouter/OpenAI Luna HTTP 200; safe skip with recorded citation; no wording-verifier request                                                                                |
| Separate clear Quran 7:31 negation assertion | `citation_and_layout_only`, zero replacements, exact copy | OpenRouter/OpenAI Luna HTTP 200; source quote and original assertion preserved; no wording-verifier request                                                                   |
| Distinct rough charity wording               | `supported_author_wording`, one replacement, exact copy   | Semantic assessment completed/supported; real OpenRouter/OpenAI Luna generation and independent verification both HTTP 200; protected quotation unchanged; no added comparand |

The two clear cases prove safe attribution, not author wording improvement.
Their external `trace.json` receipts are in
`author-first-2026-10-06T14-16-06-903Z` and
`author-first-2026-10-06T14-16-24-426Z` under the same audit directory.
Their SHA-256 hashes are respectively
`334aeebc26268526ab8cc72e02f115a2904c16e0088e7ebc6e64fca8f04ff15a` and
`30931e8aa9a73edcdbf0d12621690972af21d6e7c6ce3e39b16e7742d28a38a4`.

The rough original author wording was
`لما نخفي الصدقة ونعطيها للفقراء فهذا خير للمتصدق`.
Its actual validated replacement was
`إخفاء الصدقة وإعطاؤها للفقراء خيرٌ للمتصدّق.`
The fresh draft reused the frozen public Quran/Moyassar/Saadi passages; those
source originals were not changed or retrieved again. The independent verifier
accepted the edit before fresh copy. This is provisional model acceptance, not
scholarly approval or evidence of general semantic accuracy.

The rough-draft semantic trace also records actual OpenRouter/OpenAI Luna
extraction success, an OpenRouter/OpenAI Sol relevance timeout after 6,684 ms,
then successful direct Google `gemini-2.5-flash` relevance and assessment calls
with `fallback:true`. The supplier identities remain distinct in the trace.
This automatic provider fallback was observed without fault injection; it did
not replace an invalid candidate or a negative preservation judgment. Rewrite
generation and verification subsequently both used OpenRouter/OpenAI Luna.

The external rough-draft `receipt.json` is in
`colloquial-policy-2026-10-06T14-19-35-203Z`, with SHA-256
`70cf710f60797a175255b119ba08aa92608f88d92c2de661ce18dd3093d0ddd4`.
Its checks confirm supported completion, an actual author replacement, exact
copy, protected quotation and no new comparand. `report.json` retains the actual
semantic provider trace. All three receipt hashes were independently read back.

These first outcomes support this bounded generator-policy change; they do not
establish an acceptance rate, prove the causes of earlier uncaptured failures,
or establish shared deployment health. The unsafe earlier captured proposal
continues to fail, and provider failure remains distinct from semantic rejection.
Saleh retains deployment and acceptance authority.

Rollback: remove the generator-only policy through the issue/PR workflow. All
existing complete-evidence, quotation, meaning, modality, scope, source, deadline,
fresh-binding and copy gates remain in force in either version.
