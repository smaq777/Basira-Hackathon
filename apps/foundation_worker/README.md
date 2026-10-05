# Source-first foundation worker

This is the repository-local Python runtime for source discovery, conservative
quotation comparison, and attributable Tafsir context. It does not assess the
religious meaning of a claim, rewrite a draft, grade hadith authenticity, or
approve publication. Issue #14 packages the source-first slice; model routing
and rewrite integration remain separate work (#13/#17).

The six modules in `pipeline/` and `review_flow/` originate from
the owner-provided AI_Foundation working source. `SOURCE_PROVENANCE.json`
records their original and current packaged SHA-256 identities, bounded local
adaptations, and the adapted bridge's origin. Existing code comments and notices are retained; packaging does not
grant corpus redistribution rights. No source corpus, database, captured
provider body, frozen research output, credential, or model module is included.

## Runtime and operator prerequisites

- Python 3.11 or newer with standard-library SQLite and FTS5 support. No pip
  dependencies or AI_Foundation checkout are needed by executable code.
- An externally mounted, operator-vetted SQLite evidence index and its adjacent
  pinned manifest: `evidence.sqlite` requires `evidence.manifest.json` (replace
  the database suffix with `.manifest.json`). Mount both read-only. Their rights,
  editions, source attribution, and content-approval records require operator
  review before deployment; software checks do not establish source approval.
- Optionally, an externally mounted, vetted Tafsir snapshot directory. Source
  attribution, original/raw hashes, footnotes, pagination and schema/provider
  identities must be retained. Mount it read-only too.

The launcher can invoke the script from any working directory:

```sh
python -B apps/foundation_worker/intake_bridge.py --database /mounted/evidence.sqlite
```

An operator may explicitly enable pending research sources for a labelled
research preview:

```sh
python -B apps/foundation_worker/intake_bridge.py --database /mounted/evidence.sqlite --snapshot-directory /mounted/tafsir --research-preview
```

`--research-preview` defaults off and is a server/operator configuration, never
a request field controlled by the browser. Without it, records lacking
`content_approval: approved` or having `research_only: true` are excluded from
evidence. A research index is not an approved production corpus.

## Index and stored-context contracts

The supplied index uses `records`, `settings`, and an FTS5 `search` table. Each
record stores `id`, `role`, `reference`, `surah`, `ayah`, `original_text`,
`search_original`, `search_key`, `metadata_json`, `text_sha256`, and
`search_sha256`. The `settings` row with key `manifest` contains a JSON object
with `corpus_fingerprint`. The adjacent manifest must contain
`database_sha256` matching the database bytes and the same
`corpus_fingerprint`. Existing source-manifest metadata is retained by the
operator; its historical acquisition paths are provenance, not code imports.

`EvidenceStore` opens SQLite with `mode=ro` and checks database identity,
original/search hashes and any auxiliary search-view hashes. Original source
text is kept separate from lossy search normalization. The packaged worker
does not build, ingest, update or approve the supplied index. Legacy evidence
dossier helpers are preserved for provenance but are not used by this entry
point; the intake path does not write their optional cache.

Reviewed stored packets are named `SURAH-AYAH.packet.json`, for example
`2-256.packet.json`. Modern packets retain each source's `content_sha256` and
complete original/raw/footnote identities. Older captured packets lacking that
field are reconstructed through the same pinned adapter from adjacent
`SURAH-AYAH-WORK-partN.rpc.json` bodies. Invalid packets fail closed; they are
not silently replaced by a different work or edition. Available transport
context is not complete scholarly context.

## Live MCP versus stored context

Stored packets replay captured provider context; they are not evidence that a
live MCP call occurred. The default intake performs no network requests.
`FOUNDATION_TAFSIR_LIVE=true` explicitly enables operator-controlled live
acquisition of context missing from stored packets, and only in conjunction
with research preview. This flag cannot be supplied in the JSONL request.

The live transport uses the fixed `https://mcp.tafsir.net/mcp` endpoint,
rejects redirects, verifies the pinned `fetch_tafsir` schema during its MCP
handshake, and requests only `moyassar` and `saadi`. It retains bounded
deadlines, request/byte/page limits, no automatic retries, source integrity
checks, and in-memory session IDs. No arbitrary URL fetch, provider
substitution, durable approved-cache write, API-key configuration or paid model
call is part of this worker. Live acquisition was not exercised by the offline
tests. Operators should leave the flag absent or false for offline deployment.

## JSONL protocol

Send one UTF-8 JSON object per newline, at most 50,000 bytes including the
newline. Accepted fields are `text`, `revisionId`, and optional
`relatedReferences` (up to ten numeric Quran references). Text is bounded to
3,000 UTF-16 code units and `revisionId` is a UUID.

```json
{
  "text": "هذا نص تجريبي.",
  "revisionId": "550e8400-e29b-41d4-a716-446655440000",
  "relatedReferences": []
}
```

One JSON object is returned on stdout per accepted line. Successful packets
retain the existing `schemaVersion: 1` contract, revision hash, original text,
UTF-16 offsets, source provenance, quotation findings, context coverage and
warnings. Pending/research source labels remain visible. A partial-token
excerpt is a mismatch requiring review; a repeated excerpt has unresolved
alignment. Neither result silently selects a source position.

New findings also carry a typed `comparison` with independent `fidelity` and
`extent`, plus original-text replacements, insertions and internal omissions.
A faithfully copied contiguous excerpt retains full fidelity; its extent is
`excerpt`. An internal gap is `gapped`, independently of lexical changes. Older
immutable findings without this optional field remain readable.

`quotation-fidelity-3.0` may use a separately attributed, SHA-256-pinned
`publisher imlai original` auxiliary view already present in the index metadata.
It verifies every canonical/auxiliary token pair, grouping a declared vocative
spacing variant when needed, under limited Uthmani presentation rules: vowel/tatweel/recitation signs,
optional dagger alef, wasla and the explicitly supplied maqsurah spelling.
Hamza stays significant; only its seat may vary in the explicitly pinned
auxiliary spelling. The lexical letter آ and its decomposed form stay significant. Arbitrary letter folding,
token deletion, negation changes and unverified auxiliary editions never become
orthographic fidelity. Excerpt offsets always refer to the unchanged canonical
source, and auxiliary hashes, attribution and version remain in its provenance.
If an edition cannot be aligned under these rules, comparison stays conservative.
Canonical self-comparison emits no edits. Source-edge alignment separates a changed
last quoted word from the unquoted source suffix; internal omissions remain visible.

`source-first-intake-1.8` preserves complete declared quote wrappers and splits
inline verse markers only when an attached unique surah binds every marker to
an available verse, with no unmarked trailing wording. Other nested numbers
remain inside the whole quotation. It attaches references to their own passage and recognizes
number-first named references. Numeric footnotes and ordinary unframed formulae
are not standalone quotation findings. Search presentation aliases never change
originals and are applied to already-normalized index views to avoid reprocessing
the corpus for each passage.

Source intake v1.9 recognizes a complete balanced square/parenthesized Quran
locator such as `[لقمان: 31:15]` as reference metadata, binding the exact full
inner span to one available pinned verse and any supplied surah name. Source
speech containing a locator remains reviewable. Wrong names, unavailable sources,
ranges, malformed wrappers and author qualifications keep their conservative
fallback; score/time/ratio contexts do not resolve bare numeric metadata. Original
text, UTF16/codepoint offsets and source hashes remain unchanged. This applies to
future intakes only; historical reports are not rewritten. See
[diagnosis and offline evidence](../../docs/evidence/2026-10-05-quran-locator-intake.md).

Stored and in-memory Tafsir replays report `delivery: snapshot`; only a fresh
acquisition reports `live`. Their original acquisition transport remains separate
in provenance. A replay is not evidence of a new MCP request.
Unavailable context is cached for 30 seconds, so a later intake can recover
from a transient transport failure without restarting the worker. The worker
does not retry the same reference within one intake, even after that TTL.

Malformed/unknown request fields or failed source integrity return
`invalid_intake_request_or_source_integrity`. Oversized or unterminated lines
return `invalid_or_oversize_jsonl_request` and terminate reading. Startup source
failure returns `source_intake_unavailable` and exit code 1. Protocol errors
contain no pasted content or filesystem paths.

## Offline verification

From the repository root:

```sh
python -B -m unittest discover -s apps/foundation_worker/tests -v
```

Tests create owned synthetic records and manifests in temporary directories;
all synthetic source records remain pending research fixtures. They exercise
the real read-only SQLite/FTS5 path, source policy, quotation boundaries,
original/UTF-16 offsets, stored snapshot verification, JSONL limits and default
network disablement. They do not measure religious accuracy, approve any
corpus, make network or paid calls, or modify historical research outputs.
