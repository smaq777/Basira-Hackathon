# Tafsir MCP footnote boundary repair

Related to [issue #172](https://github.com/smaq777/Basira-Hackathon/issues/172).
Scope: bounded live Tafsir acquisition. No database/schema writes, new corpus,
model/embedding calls, semantic verdict changes or production activation.

## Observed failure and isolated cause

A direct deployed-adapter-path probe with an empty database control returned
Quran 7:31 but zero Tafsir rows. Separate public MCP protocol reads succeeded:
initialization, pinned tool listing, and both Moyassar and Saadi page 1 returned
successful responses. This isolates the observed source-acquisition failure from
database retrieval and model assessment; it does not explain every intermittent
zero-source report.

Saadi 7:31 supplies a manuscript-variant footnote with provider fields
`index`, `marker`, `text` and `type`. The adapter passed those fields directly into
the strict source-evidence footnote contract, which requires `reference`,
`originalText` and `originalSha256`. Exact-envelope offline replay reproduced
that schema failure. The old whole-batch catch then dropped the already valid
Moyassar work too, returning only the stored Quran row.

The retained public diagnostic files outside Git are
`tafsir-731-public-probe.json`, `tafsir-731-offline-stage-proof.json` and
`tafsir-731-fixed-adapter-first-outcome.json`, with final offline replay in
`tafsir-731-final-offline-replay.json`, under the owning Foundation
submission-audit experiment. They contain public source requests/responses, no
credentials or user report content. The repository regression uses the exact
footnote shape and a short unchanged critical-apparatus excerpt; it is a
transport fixture, not a semantic gold case.

## Repair and preserved boundaries

The adapter validates positive unique integer footnote coordinates, the exact
matching numbered marker, nonempty bounded text and a bounded provider type.
Unsupported footnote shapes reject that work. A coordinate reference such as
`7:31 part 1 [1]` is derived from the requested ayah, validated page and exact
provider marker. `originalText` is the provider's footnote text unchanged and
`originalSha256` hashes that exact text. All raw footnote fields, including
index/marker/type and additional metadata, remain in provenance as untrusted data
beside the existing raw commentary text and pagination metadata. Alternate
display/clean text views are not duplicated into the durable evidence packet.
Neither commentary `text` nor `text_raw` is normalized, stripped,
summarized or replaced by a cleaned view.

Each work is buffered independently. Pages must validate against the same
`total_parts` and complete within eight parts. A malformed or unavailable later
page discards the entire affected work. Counts above the limit reject early;
the eight-part boundary cannot silently truncate a longer work. Previously
completed works remain available and a later requested work can still succeed
within the original shared request/time/byte budget. Caller cancellation is
re-thrown, even after another work completed. No retries or alternate providers
were added.

The MCP tool-schema hash, protocol/reference/source checks, source-evidence
schema, exact text hashes, Quran parent binding, pending approval/research-only
status and semantic relevance/support gates remain in force. Transport completion
does not imply scholarly completeness or evidence sufficiency. The existing
work-availability coverage calculation can truthfully show a partial result when
only one work completes; no UI or contract expansion is included.

## Validation and live limits

Five initial regressions failed against the original implementation; the existing
consistent-completion case passed. The final focused patched run passed 161 tests
across Tafsir acquisition, bounded Quran discovery, Quran API, hosted source
intake and the existing semantic packet/assessment checks.
Coverage includes exact footnote preservation, additional raw footnote metadata,
unsupported/duplicate footnote coordinates, either-work failure isolation,
later-page transport failure, inconsistent pagination, completed eight-page
acquisition, rejected overflow, schema drift and cancellation. A complete
eight-part fixture with large alternate display/clean views remains within the
existing evidence budget while preserving originals and raw footnote metadata;
the budget itself is unchanged.

The final Node 24 full check passed: 919 tests across 65 files, type checking,
107 documentation files, repository policy, formatting and production build.

One direct patched adapter acquisition used the same production wrapper chain
with an empty database stub and explicit 7:31 reference. It made six public reads
(one Quran.com verse read and five MCP protocol/tool reads), with no paid model,
embedding or database calls. It returned Quran, Moyassar and Saadi. Each source
and footnote hash validated against its unchanged original. Saadi's source SHA-256
was `8673e9022c1cc47f554938161b4139ee62aa53bec083132d470e595cf3bca300`;
the exact manuscript-variant footnote SHA-256 was
`533d06aff95bd44a6a253a5fa068756eff2c926b0b760036501402a2ee49d6b1`.
The first outcome was retained; no retry was needed. After removing duplicated
provider display views, an offline replay of those same six responses retained
all three originals and hashes, preserved exact raw footnote metadata, and
produced a transport-complete intake. Its reserved evidence packet was 168,426
bytes under the unchanged 450,000-byte limit. No second live acquisition ran.

This is local patched-adapter evidence, not a deployment receipt or end-to-end
semantic acceptance. The owner still needs a fresh staging report after the
accepted build is deployed. Provider quota/extraction failures, mixed-quotation
locator limits and general retrieval relevance remain separate diagnoses.

Rollback: revert the bounded adapter change. Disabling the existing opt-in
`FOUNDATION_TAFSIR_LIVE` flag disables live acquisition while retaining available
stored evidence. Neither
option changes source approval or production visibility.
