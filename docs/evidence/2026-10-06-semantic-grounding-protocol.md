# Semantic grounding protocol: measured failures and bounded repair

Issue [#169](https://github.com/smaq777/Basira-Hackathon/issues/169), 6 October 2026.
These are controlled public-source packets and offline controls. They do not
establish a deployed Railway release, fresh retrieval acceptance or scholarly
accuracy across inputs.

## Captured failures and diagnosis

Two first-attempt captures on semantic version 1.13 reached a genuine direct
Google assessment HTTP 200 after a primary relevance body timeout. The negation
case correctly returned `contradicted`, with the canonical claim and source
identities. However, its Saadi citation omitted the inline footnote
`¬في (ب): «الذي يضرّ».¥`, joining noncontiguous source text. The wedding case
returned `not_established` with no selected evidence. Both were correctly withheld
as `invalid_citations`: the first failed exact quotation binding; the second
attempted an evidence verdict without evidence.

The external `replay-semantic169.mts` replayed the captured requests and envelopes
through the real adapter/parser/validator. Each full replay failed its expected
completed-result assertion. Keeping only the offending Saadi citation, or removing
optional wedding details, retained the same failure. The controlled replay shortened
only the captured hanging transport timer; it did not replace successful responses.
Saleh's earlier two runs lack the offending raw field, so their specific causes
remain unreconstructed.

Ranked, falsifiable hypotheses preceded the fix: free-form excerpt reconstruction
can drop inline provider footnotes; a generic status schema can admit an empty
evidence verdict despite instructions. Wrong canonical identities and decoded
JSON limits did not explain these captured failures. Historical invalid packets
remain rejected; the repair changes the next request protocol rather than repairing
an already rejected response or retrying its verdict.

## Version 1.14 protocol

The actual server selects `assessmentCitationProtocol: 'immutable-passage-v1'`.
Assessment and gap assessment use request-owned claim aliases and per-claim
passage selectors. The server resolves each chosen selector to the complete,
unchanged, contiguous original passage, including footnotes. Wrong claim ownership,
unknown or duplicate selectors and old free-form citation fields are rejected.
Claims without evidence permit only `insufficient_context` or `not_applicable`,
with no generated citations or source details. The server then constructs the
bounded public finding; the existing finding validator remains authoritative.

The internal wire packet includes its protocol and binding hash. Assessment trace
hashes cover that actual packet. Source originals, hashes, public finding schemas,
meaning requirements, provider routing and failure-only fallback remain unchanged.
Passages over 4,000 UTF-16 units are withheld rather than trimmed. Five claims,
20 sources per claim, 300 passage selectors and a 500,000-byte wire packet bound
the new representation; existing transport and server response limits still apply.
The absent option remains an internal legacy test/replay seam; the enabled server
hard-codes the new profile, without an owner configuration toggle.

## Acceptance and limits

The initial new-profile contract tests failed before implementation. Offline tests
then accepted both primary and native Google selector envelopes, preserving every
synthetic inline-footnote byte and the source hash. Negative controls still withhold
wrong claim/passage ownership, duplicates, free-form citations, false empty-evidence
verdicts and invented empty-evidence fields without an additional model opinion.
Mutation, oversized-passage, wire-hash and existing legacy boundary controls pass.
The complete offline `npm run check` passed: 76 test files, 1,074 tests passed and
one skipped, with type checking, documentation, policy, formatting and production
build checks green. The build retains the existing large-chunk warning. Final
receipt and acceptance-procedure text changes also passed documentation, formatting
and whitespace checks.

Three fresh local public-source calls with the uncommitted 1.14 change completed
through genuine OpenRouter extraction, relevance and assessment HTTP 200:

| Case                              | Result                                                     | Receipt SHA-256                                                    |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Negation, Quran 7:31              | `contradicted`; exact Quran and Muyassar passages selected | `221cd7fca6172d0c3ca35c335bffec5bfe7ad2b458e9e4b7f332c3a25c338447` |
| Wedding assertion, empty evidence | `insufficient_context`; no invented citation               | `11407c352c6ae9879f13e050653ad427f9a173f5b3663c19ee66761fa8fe08ef` |

The removed-consent condition case for Quran 4:29 also completed `contradicted`,
with four supplied sources and exact Quran and Saadi citations. Its receipt is
`semantic169-passage-v1-contradicted-condition-2026-10-06T15-29-58-872Z`,
SHA-256 `a2841df2933d7058d47cd0a0b569c669a9c6237927b9dda96c8dc8e1fbb099ad`.

The two table receipts are under the external submission audit in
`semantic169-passage-v1-contradicted-negation-2026-10-06T15-28-24-817Z` and
`semantic169-passage-v1-wedding-2026-10-06T15-28-58-869Z`. Their metadata records
`liveRailwayTest:false` and `freshRagQuery:false`. The negation model did not select
Saadi in this acceptance; exact Saadi-shaped footnote preservation is proved by
the offline byte-binding controls, not by that particular primary selection.

A separately controlled full direct-Google route, forced by a synthetic primary
HTTP 403, completed with unavailable evidence because relevance discarded all three
7:31 sources. This was a semantic false negative, distinct from citation rejection.
A one-variable probe using the same Google relevance packet selected all three
sources after an explicit clarification that opposing polarity remains relevant.
The shared relevance instruction now prepends that clarification, including
prohibition and consent-condition examples. Its schema, alias resolver, selection
rules and assessment veto remain intact.

The subsequent full route with the clarification completed `contradicted`, selecting
and citing all three original 7:31 passages, including the exact Saadi inline
footnote. This used one explicitly synthetic primary HTTP 403 to exercise the
existing fallback, followed by three genuine direct-Google HTTP 200 responses.
It does not prove a real OpenRouter outage occurred. The final receipt is
`semantic169-passage-v1-google-contradicted-negation-2026-10-06T15-33-01-470Z`,
SHA-256 `563e100f6359d4229200f579db09777480298760d7e5324267234a1fcb856f43`.
The prior incorrect unavailable-evidence receipt remains retained at
`semantic169-passage-v1-google-contradicted-negation-2026-10-06T15-30-44-027Z`,
SHA-256 `8e4ae43d409b23e44188139d9567c0535722a8176e0b5149d5a93b090796ca52`,
along with the intervening single-variable relevance probe at
`gemini-relevance-probe169-2026-10-06T15-32-06-640Z`.

All captures use frozen public-source intakes locally. Owner merge/deployment and
a fresh six-case staging acceptance run with version 1.14 remain required.

No database migration, source normalization, false-verdict conversion or invalid
output retry is part of this change.
