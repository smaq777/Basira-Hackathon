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
reconsideration and canonical assessor delivery. Changed-packet paid comparison
remains pending a new freeze and lead technical review; no improvement claim is
made from these offline tests. Rollback is an application-code rollback to the
previous selector; no database migration or source-record mutation is required.

## Separate citation-inventory correction

Bracketed references matching the intake manifest are excluded as bibliographic
framing. Named Quran chapter/verse notation is recognized only when its numeric
reference matches a Quran source in that manifest; Arabic digits and reference
whitespace/diacritics have a comparison-only normalized key. Unmatched or ambiguous
bracketed text is retained under existing inventory rules. Author brackets and
parentheses containing conditions, negation or exceptions remain in the exact
claim span. This is syntactic inventory handling, not semantic claim pruning or
verification of the reference. Source originals and citation validators are
unchanged. The correction is committed separately from the alias binding change.
