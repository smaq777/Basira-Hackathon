# Exact claim-selection aliases

Related to #11. Stacked on the reviewed capacity and cache/content delivery work;
shared staging and religious/content acceptance remain separate.

## Observed fixed-packet baseline

Twelve current-extractor calls used six declared public Arabic packets twice, with
no assessment, retrieval, embeddings, SQL writes, retry or favorable-repeat choice.
Two responses were rejected for the same one-character candidate-ID mismatch;
six selected canonical claims and four were valid empty selections. All provider
transports succeeded. Recorded response cost was $0.001832175, with no unknown
failed-call billing in this run. The historical mixed-writing response itself was
not retained; these new responses do not establish its missing payload or cause.

The explicit reference control selected a bibliographic fragment as an assertion
in both repeats. Binding validity therefore does not demonstrate a correct claim
inventory or semantic completeness. The whole author assertions retained their
negation, conditions and modal wording through server-owned spans. The reference
fragment's evidence keys differed across repeats. These are selected engineering
controls, not scholarly gold, unseen accuracy or general reliability evidence.

External retained records are in
`Project_Code/AI_Foundation/experiments/claim-selection-binding-2026-10-05`:
`FIXTURES_V1.json`, `BASELINE_PROTOCOL_V2.json`, twelve `BASELINE_CELL_*_V2.json`
files, `BASELINE_RESULTS_V2.json`, `BASELINE_ANALYSIS_V2.json` and independent
`LEAD_BASELINE_AUDIT_V2.json`. Prior protocol versions remain immutable.

## Binding change

Prompt/pipeline v1.9 sends request-local C/E aliases. The server owns a copied
candidate/evidence map and translates exact aliases only, then applies the original
canonical span and source guards. No fuzzy identity repair, boundary rewriting,
source substitution, relaxed citation validation or forced selection is added.
Unknown and duplicate aliases reject affected proposals; independent valid rows
remain usable under the existing partial-result behavior. Valid empty selection
keeps the existing bounded reconsideration, distinct from malformed binding.

Optional report-local diagnostics store fixed rejection counts, proposal/accepted/
rejected totals and payload/map hashes for at most two selection attempts. They do
not store unknown returned identifiers, draft text, final model payload or private
reasoning. Existing v1.8 report traces remain readable. Assessment and durable
coverage continue to use canonical IDs, exact spans and evidence keys.

Focused software controls cover exact mapping, Unicode/qualified author spans,
source-parent aliases, unknown/duplicate rejection, mutation isolation, empty
reconsideration and canonical assessor delivery. Changed-packet paid comparison is recorded below; offline tests alone do not
establish model reliability. Rollback is an application-code rollback to the
previous selector; no database migration or source-record mutation is required.

## Separate citation-inventory correction

Standalone/trailing bracketed references matching the intake manifest are excluded
as bibliographic framing. Named Quran chapter/verse notation must match the exact
Quran source reference and supplied surah_name/surah_name_original metadata;
wrong or missing names remain visible. Inline references followed by author prose
remain inside the complete assertion rather than splitting its qualifications; Arabic digits and reference
whitespace/diacritics have a comparison-only normalized key. Unmatched or ambiguous
bracketed text is retained under existing inventory rules. Author brackets and
parentheses containing conditions, negation or exceptions remain in the exact
claim span. This is syntactic inventory handling, not semantic claim pruning or
verification of the reference. Source originals and citation validators are
unchanged. The correction is committed separately from the alias binding change.

## Offline verification

The integrated issue branch passed the required repository check: 52 test files /
700 tests, typecheck, documentation links, bounded policy checks, formatting and
production build. The focused alias/inventory/assessment suite passed 107 tests;
full-flow cache passage and empty-recovery fixtures also use the new strict wire
aliases while assessor citations remain canonical. No provider calls or database
writes were made by these checks. The existing build chunk-size warning remains.

## Frozen changed-packet comparison

At frozen source `8fab08f`, a reviewed V2 protocol made exactly twelve Luna/OpenAI
low extraction-only calls over the same six original intakes, twice each. All
first responses were retained: eight valid selections, four valid empty
selections, zero binding rejections and zero provider/schema/transport failures.
Recorded response cost was $0.001410035; unknown failed-call billing was empty.
Both final JSON and canonical selected spans/evidence keys were repeat-identical
for all six controls. The previously rejected mixed-writing claim selected its
exact canonical span in both repeats. The explicit modal reference control
selected only its complete author assertion; its separately corrected inventory
no longer offers the bibliographic fragment. Quote-only and question/greeting
controls remained empty. No recovery, assessment, web, embedding or SQL stage ran.

Independent `LEAD_ALIAS_AUDIT_V2.json` recomputed all twelve final payload hashes,
canonical original-span identity and repeat consistency. Frozen protocol
`ALIAS_COMPARISON_PROTOCOL_V2.json` binds sixty repository and eleven external
hashes; its SHA-256 is
`6936452b4ab7f530f6b9d01a36a7e0a0ac33ea6df05665658f5e22b52b39a7b4`.
`ALIAS_COMPARISON_RESULTS_V2.json`, twelve `ALIAS_CELL_*_V2.json` receipts and
`ALIAS_COMPARISON_ANALYSIS_V2.json` retain the outcomes. The earlier alias V1
freeze was offline-only and remains preserved, superseded after the reviewed
name/inline-span refinements. Baseline source `a84ec9c` and changed source
`8fab08f` remain separate frozen checkouts; no historical receipt was rewritten.

The selected binding failures decreased from two to zero. This combined
prompt/schema alias and citation-inventory correction does not isolate each
change's causal effect or demonstrate unseen accuracy, complete extraction,
source relevance, religious support or general reliability. Historical missing
response content is still unknown. UI integration is a subsequent experiment,
not established by extraction-only success.

## Owner-preserving integration

A separate integration worktree preserve-merges current development `f130560`
(owner hosted-demo PR #97) with frozen `8fab08f`. The owner adapter remains
unchanged: hosted demos have read-only corpus retrieval, unavailable literal
quotation checking, no Python/MCP/web/cache/rewrite activation, and explicit UI
capability limits. Saved-result/human-ticket fallback, fixed-capacity handling,
canonical citation validation and local cache/content preferences are preserved.
Integrated required checks pass 53 files / 710 tests plus typecheck, docs, policy,
format and build. No shared runtime, environment file or source original was
changed. A new two-case loopback UI protocol remains pending technical review;
these checks do not establish hosted staging readiness or fresh UI success.
