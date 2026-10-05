# Retained public-page passage index (#8, related #11)

The default-off index addresses a concrete limitation: legacy cache vectors describe
one title/topics/head/tail view per full page. Migration `0011` adds exact contiguous
passage metadata and separately pinned vectors. It does not approve pending sources,
change claim extraction, or establish scholarly truth.

## Representation and delivery

`cache-sentence-context-v1` groups exact sentence units into cores of at most 1,800
UTF16 units and adds whole adjacent units when context fits 3,000 units. Giant units
are explicitly marked as boundary cuts. Parents remain capped at 30,000 units and
32 passages. Every view binds parent/text SHA-256, UTF16/codepoint offsets, core
offsets and version. Delivery recomputes all bindings; database triggers independently
check parent availability, exact text, hashes and offsets.

Only `openai/text-embedding-3-small`, 1,536 dimensions and
`exact-contiguous-context-v1` vectors are accepted. Exact pgvector scan and lexical
trigram ranks are fused with reciprocal ranks. Up to three preferred hits per parent
and eight parent results compose with legacy results. Legacy parent order is
preserved: matching indexed parents receive verified windows, while passage-only
parents fill vacant slots without displacing legacy hits. This conservative design
improves context delivery within selected parents; it does not claim improved parent
discovery. Index failure retains legacy fallback. Runtime search reuses the
existing query vector and never backfills document vectors.

Per-claim preferences are report-local and bind claim ID/query hash/parent hash.
Existing seed evidence remains unchanged. Assessor packets, citation validation and
rewrite evidence use the same verified windows. Shared cache admission explicitly
rejects transient hint keys before SQL/classifier calls.

`fullTextIndexed` means core text coverage, not available vectors or complete religious
context. Backfill receipts separately count available embeddings and failures. Whole
neighbors cannot guarantee remote footnotes/exceptions/cross-references. Boundary
cuts retain the existing insufficient-context assessment rule.

## Offline operation

After isolated migration validation, use `node --import tsx
scripts/backfill-cache-passages.mts --manifest <public-parent-manifest.json>
--receipt <new-receipt.json>` from the repo. Default mode is read-only. The manifest
pins policy SHA-256 and one to eight exact retained parent keys/hashes/URLs. Supply
`FOUNDATION_PASSAGE_READER_DATABASE_URL` for the existing research reader and, only
for apply mode, `FOUNDATION_PASSAGE_WRITER_DATABASE_URL` for the existing cache-writer
login. Both must be distinct principals on the same direct host/database with verified
TLS. Do not grant permanent writer membership to the owner to make this tool run.
No connection string is printed or written to a receipt.

`--apply --max-embeddings 0` inserts metadata only. Paid execution additionally
requires `--allow-paid --max-embeddings <0..256>` and the owning OpenRouter key.
No automatic retry occurs. Later explicit runs skip compatible existing vectors and
resume missing ones. Each run reserves a new receipt; the backfill phase has a
deadline at most 120 seconds, separate from connection/plan/receipt operations.
SQL statement timeouts still bound in-flight statements, and cancellation prevents
later vector commits. It acquires no pages and makes no classifier or semantic judgment calls.
Failed-call billing is unknown; response costs require separate provider receipts.

The CLI requires a direct connection but does not discover or certify branch isolation.
The validation operator must independently bind endpoint/database/roles to the frozen
child receipt before invocation. It must never target the active research branch or
production. Connection/provider errors are logged only as fixed public error codes.

## Validation and rollback

Synthetic tests exercise Unicode bindings, outages/resumption, cancellation without
late SQL, incompatible vectors and shared admission rejection. The complete
cache/corpus/retrieval/assessor regression uses two distinct dense middle windows from
the same existing seed. Each claim receives its own window; cross-claim citation fails.

The first isolated schema application succeeded, but functional insertion failed:
`cache_utf16_length('')` returned 1, rejecting valid zero-prefix bindings. Forward
migration `0012` filters the empty row; applied `0011` remains unchanged. The initial
single-pool operator also failed because the owner cannot set the cache-writer role;
the corrected operator uses separate reader/writer connections. All failures are
retained. Temporary probe membership was rolled back and independently read back
as unavailable. Twelve actual-role rollback probes passed, including zero-prefix
and astral round trips, malformed bindings, reader insertion denial, writer mutation
denial and expiry visibility. Separate least-privilege read-only and zero-embedding
metadata CLI runs passed; four parents/eight exact windows were independently read
back. Owner-only trigger/revocation tests were not completed and are not claimed. Fresh-database migration failed at copied role creation in `0008`;
this separate [bootstrap issue #81](https://github.com/smaq777/Basira-Hackathon/issues/81)
retains the empty database and historical SQL without modification.

Frozen external `VALIDATION_PLAN_V1.json` remains unchanged. Final phase protocols
bind the child `br-weathered-tooth-b2luwnxr`, committed module/migration hashes,
provider configuration and immutable public inputs. `FINAL_PHASE2_PROTOCOL_V2.json`
and `PHASE2_RESULTS_V2.json` in the external `cache-passage-index-2026-10-05`
experiment retain 12 cells: six queries twice, with the same 16 eligible legacy parents
and only four indexed originals. Eight document and twelve query attempts produced
19 validated responses; recorded response cost was $0.00017984. The repeat-2
weak-hadith query failed transport, has unknown billing and used lexical fallback;
there was no automatic retry.

The original passage-first composition caused a blocking regression: all four
unindexed-riba controls moved the legacy rank-1 source to rank 5 and lost it from the
composed top two. It must not be activated. The correction preserves legacy ranks
and enriches verified windows. The frozen zero-provider replay at `589de58`
retained all 12 cells and the unavailable repeat-2 weak-hadith vector. All 24
legacy/composed ranking pairs matched; all four unindexed-riba controls retained
rank 1 and top-two selection. The full obedience paragraph reached corrected
assessor packets in four of four arms, versus zero of four baseline arms. The
replay verified 1,204 delivered passage bindings without mismatch. No replay arm
was empty, but this warm replay does not resolve the historical delivery failures. Travel already delivered its corrective footnote under the baseline, so no
benefit is claimed there. Conservative ranking forfeits the observed weak-hadith
lexical parent-selection gain; unified comparable parent relevance remains future work.

Three composed-corpus hybrid diagnostic arms delivered no cached parents despite
valid direct rankings; their harness base corpus was empty, so this does not show
that the full app lacked other corpus sources. These remain delivery failures in
the denominator. Their timings are consistent with exhaustion of the existing
3-second cache budget, which silently drops cache failures; surfaced
outcomes and a configurable bounded budget are separate [issue #17](https://github.com/smaq777/Basira-Hackathon/issues/17).
`REPLAY_RESULTS_V2.json`, `REPLAY_ANALYSIS_V2.json` and
`POST_REPLAY_FINAL_UNIVERSE_V1.json` retain the results. Final read-only actual-reader
verification found the same 86-passage corpus, 16 byte/provenance-identical originals,
four indexed parents, eight metadata windows and eight vectors. Neither the active
research parent nor production was modified. The isolated UI preview remains pending.

Some tail windows contain navigation fragments and can start inside a URL without
`boundaryTruncated`; all eight are exact windows, not necessarily substantive article
passages. Body cleaning/chunk boundary changes require a separately versioned design.
Partial coverage is selected engineering evidence, not unseen accuracy, religious
correctness, reviewer-labelled Recall@5, source approval or owner acceptance.

Rollback switches `FOUNDATION_WEB_CACHE_PASSAGES_ENABLED=false`; retain applied
migrations and immutable parents/vectors. Changed model/chunker representations need
a forward migration. No new extension or ANN index is added. Full-parent evidence
still consumes the existing report budget. Durable report compaction, 170-passage
completion, capacity UX and production activation are deferred.
