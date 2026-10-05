# Fixed-evidence routing diagnostic — issue #13

## Question and protocol

Does a configured stronger route improve judgments when claims and evidence are
held fixed? The diagnostic compares `openai/gpt-6-luna` at low effort with
`openai/gpt-6.1-sol` at medium effort. It uses three complete public Muyassar
assertions and five authored negation, scope, exception and unavailable-evidence
controls. The eight selected cases run twice per route in four calls. Extraction,
retrieval and source acquisition are outside this comparison.

Both routes receive the same v1.7 system/task prompt, strict final JSON schema,
claim IDs, source originals, context and exact-citation checks. Non-routing
request factors are identical. The corrected protocol was frozen before eight
fresh calls. Model and effort change together; this is a routing-configuration
comparison, not an isolated causal model experiment or a scholarly gold test.

## Observed results

| Configuration | Valid calls | Diagnostic relation agreement | Stable repeated relations | Identical detailed fields across repeats | Median call | Provider-reported cost |
| ------------- | ----------- | ----------------------------- | ------------------------- | ---------------------------------------- | ----------- | ---------------------- |
| Luna low      | 4/4         | 16/16                         | 8/8                       | 1/8                                      | 11.509 s    | USD 0.002356           |
| Sol medium    | 4/4         | 16/16                         | 8/8                       | 0/8                                      | 26.038 s    | USD 0.041832           |

The expected relations were observed for lawful vows, refusal of sin while
maintaining kindness to parents, lineage/piety and the immediate-sale exception.
Empty evidence remained unavailable; an unrelated Yusuf source family did not
establish the debt assertion. Exact citation and original-hash checks passed.

Verdict stability does **not** establish complete qualifier consistency. Detailed
conditions, negation, exceptions and scope vary in wording and categorization.
For example, a Luna repeat placed the prohibition on breaking confirmed oaths in
conditions/explanation while leaving `negations` empty. A Sol explanation mixed
an English token into Arabic. These findings require structured qualifier and
Arabic-language evaluation; matching status labels do not erase them. Detailed
string inequality also does not by itself prove a semantic error.

Official endpoint metadata advertised reasoning/effort support, and Sol requests
used medium effort with `require_parameters=true`. All four Sol response and
generation receipts reported zero reasoning tokens. The configured effort was
accepted, but actual stronger thinking was not demonstrated. Luna's four
reasoning-token receipts were 0/111/0/90. This limitation remains unresolved.

## Invalid runs, outages and independent audit

The original assay rejected provider reasoning metadata in three Luna responses
even though the app validates final content independently. Its failures, final
text and charges remain retained. The corrected assay removed only that harness
restriction and ran eight fresh calls; it did not rescore old outputs or repair
generated text. No private reasoning was persisted. The frozen correction prose
mistakenly says two original metadata rejections; original result receipts prove
three. The immutable protocol remains unchanged, with this count erratum recorded
separately.

The original and corrected assays account for 16 calls and USD 0.133414 in
provider-reported cost, not an invoice reconciliation. A corrected read-only
catalog preflight timed out before any paid cell; paid calls had zero retries.
Separate simulated actual-adapter HTTP 503 and deadline tests produced
`upstream_unavailable`/`timeout`, each with zero semantic judgments.

An independent lead audit checked the protocol/request/packet hashes and freeze
ordering, equal non-routing request factors, unmodified raw final outputs, exact
originals against the frozen corpus manifest and all citation substrings. It
recomputed counts, cost and medians. This is a reproducibility/integrity audit,
not independent scholarly adjudication of relation or qualifier labels.

External local artifacts, without committing public corpus bodies or credentials:
`Project_Code/AI_Foundation/experiments/fixed-packet-models-2026-10-05/`
contains `PROTOCOL_V2.json`, `RESULTS_V2.json`, `ANALYSIS.json`,
`ROUTE_VERIFICATION.json`, raw final-content receipts and `LEAD_AUDIT.json`.
Corpus version:
`794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`.
Sources remain pending research records.

## Decision and remaining acceptance

No relation improvement from blanket Sol use was demonstrated on these cases.
Luna remains a reasonable provisional assessor for this bounded contract; the
existing app's risk-based route is not silently replaced by this small diagnostic.
Measure any proposed routing change on frozen unresolved compound claims and
qualifier attachments before adoption. Stronger models cannot provide missing
attributable evidence, and model consensus cannot approve a source.

Remaining: representative automatic extraction/retrieval, adjudicated qualifier
attachments, source-family held-out baselines, repeated real-writing assessment,
editor benefit, qualified source/rights review and Saleh acceptance. See the
[ordered delivery plan](../planning/AI_FOUNDATION_NEXT.md). This diagnostic does
not complete issue #13 or scientific evaluation issue #18.
