# Hosted quotation boundary and ambiguity controls

Related to [issue #133](https://github.com/smaq777/Basira-Hackathon/issues/133).

## Observed defect and bounded correction

The accepted hosted adapter at `901e46c5f7087a4a8cb5cecf49d1fedbb4abec66`
used the first raw substring or first normalized token alignment. The retained
public Tanzil 31:15 diagnostic therefore classified a mid-word fragment as an
exact excerpt at UTF-16 offsets 94–104. A synthetic repeated phrase selected its
first occurrence. These are quotation alignment defects, not religious or source
approval findings.

The adapter now checks raw occurrence edges against original token boundaries
and checks uniqueness across raw and existing orthographic token alignments.
Overlapping occurrences count separately. Quotations without lexical comparison tokens remain unresolved with no selected
offsets; isolated Quran stop marks are not lexical quotations.
Multiple eligible alignments, including
one raw exact occurrence alongside an orthographic variant, produce an unresolved
finding without selected offsets. Raw word fragments cannot produce faithful
matches. Unique full quotations and excerpts retain original UTF-16 offsets; an
omitted final combining mark uses the existing orthographic fidelity instead of
raw exact fidelity.

The existing normalization rules and the minimum two-token threshold for accepting
an orthographic match are unchanged. This correction does not establish broader
normalization accuracy, quote extraction coverage, scholarly approval or deployed
behavior. Source originals, source hashes, report schema, retrieval configuration
and historical reports are unchanged.

## Offline verification

The focused suite has 34 passing tests. New controls cover prefix/suffix fragments,
overlapping and repeated raw phrases, repeated orthographic variants, mixed exact
and orthographic occurrences, punctuation boundaries, astral characters, combining
marks, non-lexical stop marks, full retained Tanzil 31:15 and its unique negated excerpt. Every helper run
checks original draft bytes/hash, exact source identity, and UTF-16/codepoint draft
segment reconstruction. Synthetic controls are explicitly labelled.

The first red run had eight actual defect failures and two erroneous expected
UTF-16 lengths in test fixtures. The fixture lengths were corrected transparently;
the second red run retained eight failures and 21 passes against unchanged source.
The red receipts and original diagnosis remain outside Git in
`AI_Foundation/experiments/hosted-quote-boundaries-2026-10-05` and
`AI_Foundation/experiments/integration-lead-v1/HOSTED_QUOTATION_901E46_DIAGNOSTIC_V2.json`.
The prior diagnostic V1 schema failure remains retained separately.

Full repository checks pass: 55 test files / 803 tests, TypeScript, 94 Markdown
files with checked local links, policy, formatting and build. The offline Python
suite passes 51 tests. The build retains the existing large-bundle warning.
Exact logs and implementation hashes are retained externally with this change. No provider calls, browser replay, corpus expansion, SQL writes, deployment
or environment changes were made for this correction. Owner review and acceptance
remain separate. Rollback is a source revert; no migration is required.
