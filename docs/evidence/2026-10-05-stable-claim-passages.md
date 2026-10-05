# Stable original spans and bounded evidence passages

Issue [#11](https://github.com/smaq777/Basira-Hackathon/issues/11), related to
#8 and #18. This task branches from development `13a3199` and explicitly includes
unaccepted PR #59 revision `d66ce71` as its runtime dependency. Neither dependency
nor local verification establishes owner acceptance, scholarly correctness or
production activation.

## Changed behavior

Semantic v1.7 builds a deterministic inventory of bounded original author spans
before the extractor call. IDs bind revision hash, author segment and UTF16
offsets. The model selects at most five candidate IDs and known evidence keys;
it cannot choose new substring boundaries or supply invented author wording.
Selections resolve in original order, independent of returned array order.
Duplicate selections are rejected without discarding unrelated valid candidates.
Questions, recognizable source framing, delimited quotations, source-anchored
parenthesis quotations and standalone fragments are excluded. Parenthesized author
conditions remain intact. Oversized sentences are excluded visibly rather than
split before a potentially distant qualification.

These are syntactic spans, sometimes compound assertions, rather than guaranteed
atomic semantic claims. The model must assess every material clause. Candidate
selection, omission and semantic judgments remain provisional and can vary;
deterministic IDs do not establish deterministic inference or complete coverage.
The optional claimCoverage trace records the complete inventory offsets,
excluded ranges/reasons, selected and unselected IDs and whether the five-claim
limit was reached. A concise Arabic limitation discloses unreviewed coverage.

Extraction previews and assessment requests now use relevance-ranked exact
contiguous passages, up to three windows of 4,000 UTF16 units per source. Ranking
matches topics, including contradictory wording, rather than predicted support.
Clean windows include the matching sentence and both immediate neighboring
sentences, where the bound permits; late-page matches can outrank opening text.
Every view carries the immutable full-source hash, source identity, exact offsets,
stable passage ID, contextTruncated and boundaryTruncated. Original text is never
normalized for display, reconstructed or replaced in persisted intake. Search
normalization affects relevance only.

A giant sentence requires a bounded cut and is explicitly boundaryTruncated.
The assessor is instructed to abstain for a material missing qualifier. A local
guard additionally downgrades supported/contradicted to insufficient_context when
all cited views cut sentence boundaries, with an Arabic missing-context explanation.
Clean complete-sentence windows are not automatically downgraded merely because
other page context is unavailable. Citation excerpts must occur inside an actually
supplied passage; a valid substring hidden elsewhere in the full original is rejected.
The same rules apply to gap reassessment. Draft/source instructions remain untrusted.

Durable passage traces store offsets and hashes, not duplicate passage text.
Legacy v1.1–v1.6 reports remain readable without relabeling their versions. No
database migration or historical report rewrite is required.

## Validation and limits

Node 24 `npm run check` passed in the isolated issue worktree: typecheck,
35 test files / 523 tests, documentation links, policy checks, formatting and
production build. The build retains its existing large-client-chunk warning.
Checkout CRLF formatting was normalized locally; unrelated source content is
absent from the commit. These are software delivery checks, not correctness gold.

Direct new-wire controls cover repeat IDs, reordered selections, repeated wording,
duplicates/overlap, unknown IDs, original binding, UTF16 surrogate boundaries,
questions/quotes/framing, preserved author conditions, late-page qualifying context,
contradiction relevance, oversized sentence exclusion, hidden citations, and the
unsafe-cut verdict guard. Existing semantic transport, cancellation, provider
failure, discovery, report-binding and durable packet-budget checks remain.

The external frozen public Amanah experiment uses the existing captured original
and source packet. Its executable extraction-only harness and raw receipts are
kept under AI_Foundation/experiments/sermon-evaluation-2026-10-05, outside Git;
source publication is not correctness gold. Assessment is a local placeholder in
this experiment, not a model support result. The initial three calls failed HTTP
401 due to a local harness credential-loading mismatch; those failures are
preserved. A corrected owning-file parser restored provider access. Intermediate
repeats exposed source-framing fragments; they remain recorded separately from
the final corrected inventory. The final three calls returned HTTP 200 and selected
the same one compound candidate ID in original order. The original author span
is 272 UTF16 units; source-framing fragments no longer become candidates. This
is a small extraction repeat result, not evidence of deterministic support
judgments, atomic claim recall, or scientific accuracy. The generated assessment
request passed the runtime byte guard but was answered by a local placeholder.
The final receipt is stable-v17-extraction-repeat-final.json. Reproduce with Node
24 and the repository's tsx loader, running the external
stable-v17-extraction-repeat.mjs with a fresh EXTRACTION_RUN_LABEL to preserve
existing receipts. The owning credential stays outside Git.

Full originals continue to occupy the existing 500 KB durable evidence budget.
This change reduces assessor payloads; it does not repair evidence-family skips
caused by large persisted originals. Semantic-only paraphrase recall, distant
cross-page qualifications, broader source coverage, source rights, independent
scholarly adjudication and user confirmation of claims remain unresolved. No
production writes, deployment, merge, issue acceptance or closure are included.

Rollback: revert the v1.7 implementation commit and route new requests through
the previous version. Existing v1.7 reports remain explicitly versioned; keep
their additive readable schema fields if rolling back runtime behavior only.
