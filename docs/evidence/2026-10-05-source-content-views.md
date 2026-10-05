# Conservative source content views (#8)

This default-off follow-up was frozen at `0c04dcf` on local integration base
`7b08054`. The owner has since merged #59, #70–#78 and #80 into development
`0b13a8c`, then #88/#89 at `661fef8`. This corrective integration preserves those
accepted changes, including ticket migrations `0013`/`0014`, and assigns cleaning
deployment migration `0015`. Local tests are separate from deployment, source approval and scholarly
acceptance.

## Retained isolated SQL failure and forward validation

The original frozen source and protocol remain immutable. On isolated child
`br-square-salad-b2mo9m2a`, actual separate reader/writer preflight verified the exact
16 retained originals, 86 corpus passages, four v1 indexed parents, eight windows
and eight vectors. Own role membership was present and opposing SET membership was
absent. Experimental `0013_source_content_views` applied with historical checksums
unchanged; that was schema metadata evidence only.

Six view-binding probes passed, including supplementary Unicode, exact URL/hash,
missing fields and range mismatch. The first content-passage insertion then failed
with SQL `42702`. Read-only function inspection confirmed that the PL/pgSQL variable
`r` collided with the range alias `r` in the passage guard. Independent readback
verified zero synthetic sidecars and unchanged 16/8/8 counts after rollback. The
operator and paid classifier stages did not run.

Applied experimental `0013` and its checksum remain preserved in the failed child,
commit `0c04dcf` and exclusive external receipts under
`source-content-cleaning-2026-10-05`. They are not deployment history for the new
integration. Corrected frozen source `ae11c0d` used an explicit
`retained_range.value` alias. A new isolated child, `br-little-pond-b2y5usie`, verified
secure-ticket `0013` dependencies and applied it followed by experimental cleaning
`0014`. Fourteen actual-role/window rollback probes passed. The failed child remains
unchanged. Owner development subsequently assigned its direct-ticket migration
`0014`; the unapplied deployment cleaning file is now `0015`, changing only its
advisory-lock and migration-metadata labels. The successful experimental `0014`
checksum and receipts remain unchanged and do not claim exact deployment-chain parity.

## Classification and selection

With `FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED=true`, the existing pinned
`openai/gpt-6-luna`, OpenAI-only, low-effort classifier returns topics and labels for
every exact source block in one request. Default topic-only classification remains
compatible. There is no additional cleaning call, retry, provider fallback, source
rewriting or invented reference.

`exact-markdown-blocks-v1` partitions the complete fetched original, including blank
line delimiters, into at most 128 blocks. IDs bind original hash and UTF16 offsets;
blocks also retain codepoint offsets and text hashes. Labels cover article, citation,
footnote, dialogue, navigation, audio/download, related links and uncertain. Complete
unique labels are required. Invalid label coverage retains valid topics and records
an original-retained outcome; malformed whole responses fail classification.

Removal requires BOTH a model boilerplate label and a deterministic structural gate.
The first gate recognizes trailing standalone same-site fatwa/category link clusters
with at least two related fatwa links and two category links. Another recognizes
narrowly named audio-only controls (including the observed `تحميل المادة`) with
audio extensions. The exact ordered `play` / `00:00` / `max volume` / `- ×null`
cluster is eligible only immediately beside such a verified audio link and with
matching model labels; unanchored numbers/plain text remain retained. Prose, dialogue, conditions,
negation, exceptions, inline citations, numbered footnotes and uncertain blocks remain
retained even if mislabelled. Plain title tails, isolated source links and ambiguous
downloads remain retained. This limited representation is not a general article
extractor or a semantic completeness guarantee. The block limit can prevent a view.

## Separate immutable storage and exact delivery

Additive deployment migration `0015` creates insert-only public view/body-window sidecars.
Original cache text, hashes, metadata and v1 window/vector records remain unchanged.
SQL verifies parent URL/hash/policy and Unicode range bindings. RLS hides expired or
revoked parents; the existing cache writer can insert but cannot update/delete.
SQL binding checks do not prove machine labels true. Delivery independently
recomputes the conservative selection and every exact window.

The first parent/version sidecar is immutable. Conflicting selection/classifier
receipts are collisions, not replacements. Changed policy needs a separately
reviewed representation/version and forward migration.

`exact-content-block-context-v1` windows are contiguous substrings of the full
original, at most 3,000 UTF16 units and 32 windows. Excluded interior audio creates
separate ranges; citations never join disjoint text. `contextTruncated` is true when
another retained block lies outside the window. Recognized trailing boilerplate alone
need not make a complete short article partial. The selection retains substantive
blocks, but bounded packet windows do not guarantee delivery of every remote footnote.

Lexical lookup enriches only already-ranked parents and preserves legacy identity and
order. Report-local preferences bind claim/query/parent/window hashes and the selected
view proof. Assessor, citation validator and rewrite resolve the same spans, including
an existing immutable intake seed. Shared parent admission rejects transient view
preferences; sidecars contain no draft/claim/query. Failure retains original delivery
with a fixed outcome. Topic caching with no cleaning is explicitly recorded.

There are **no cleaned-view vectors** in this version. Existing v1 vectors retain
their original labels. New vectors need a separately frozen offline embedding phase.
No discovery gain, source approval or solved full-parent report budget is claimed.
Cache deadlines/outcomes remain separate #17 work; durable compaction is deferred.

## Operation, validation and rollback

The zero-provider `scripts/backfill-source-content.mts` defaults to a read-only plan.
`--apply` inserts sidecars for at most four exact retained key/hash/URL/selection
manifest parents. Separate direct reader/writer connections must share host/database;
TLS is verified. Runtime activation also requires matching reader/writer
database endpoints, distinct principals and verified TLS. A held exclusive receipt prevents historical overwrites. Public
errors contain fixed codes. The operator itself does not certify branch isolation;
an external frozen endpoint/role audit is required before execution. Plan/apply has
a bounded phase deadline up to 120 seconds, with separate connection/SQL timeouts.
It does not promise hard interruption of in-flight SQL; abort is checked before commit.

Offline tests cover Unicode partitions, invalid labels, protected mislabels/footnotes,
uncertain/plain title tails, disjoint gaps and retained-group partial flags, hash
tampering, collisions and parent ranks. The full cache/corpus/claim/assessor flow
delivers separate body windows to two claims sharing a seed; cross-claim citation
validation still rejects the wrong span.

The corrected isolated SQL/operator validation passed before eight joint-Luna calls
on complete Bin Baz 8880/8881 originals, 11647's corrective footnote and 19992's
conditional discussion. All eight responses were valid. The two cleaned parents
each removed eleven recognized boilerplate blocks; both control originals stayed
complete. Removed block IDs were repeat-stable, but parent 8880's proposed topic
varied between worship and ethics. These selected controls are not scholarly gold,
unseen accuracy or general classification reliability.

First-repeat-only admission stored four immutable views and eight exact body
windows. Independent readback retained all sixteen original parents and all eight
older windows/vectors. Actual reader enrichment delivered six verified hints for
the cleaned parents, while both no-removal controls stayed identical. All protocols,
outputs and failures remain external under `source-content-cleaning-2026-10-05`;
no output was chosen after inspecting both repeats. This establishes isolated
schema/operator/reader behavior, not a fresh complete UI report, improved semantic
accuracy or acceptance of deployment `0015`. No active-parent, production or owning
`.env` write occurred.

Rollback disables `FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED`; original/v1 retrieval
remains available. Preserve applied migrations/sidecars and historical checksums.
Copied-role fresh-database bootstrap remains separate #81 work.
