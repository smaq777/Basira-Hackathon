# Source-report follow-up verification

Related to #12, #14 and #16; hosted retrieval validation belongs to #6/#8.
This follow-up extends draft PR #59; it is not merged or deployed.

## Implementation reviewed

- Independent quotation fidelity/extent fields with original-text replacements,
  insertions and internal omissions. A hashed, attributable imlai auxiliary view
  must align under limited script rules before comparison. Canonical originals,
  hashes and UTF-16 offsets remain intact. Repeated/partial-token matches abstain.
- Question/quotation-only applicability is handled conservatively. The report
  executes no semantic-model prompt and does not infer support from a correct quote.
- Human source references, Quran reader links and concise deterministic Arabic
  explanations replace technical IDs, download links, version and trace panels.
  Diagnostics remain in backend evidence. Explicit reanalysis creates a new run.
- Optional bounded live Tafsir acquisition is restricted to local research
  preview. Snapshot replays no longer claim fresh live delivery. The capabilities
  response distinguishes configured source access from semantic verification.

## Actual local checks

The supplied saved report was restored in the current Basira-Hackathon UI. Its
new reanalysis preserved the original text and historical report. The Quran
finding identified the opening-word replacement and omitted `والأرض`, without
penalizing the omitted end of the ayah or ordinary Uthmani/imlai differences.
Both Muyassar and Saadi for 39:38 appeared from the freshly acquired snapshot.
Inference displayed that no assessable conclusion was present.

A second browser submission using `لا إكراه في الدين` with reference 2:256 showed
orthographic fidelity and a contiguous excerpt. Both associated tafsir works
appeared; no inference verdict was fabricated. Browser checks also confirmed
readable work/surah citations, the fixed Quran.com reader destination, and removal
of public hashes, internal hadith identifiers and trace panels.

The new Python suite passed **25 offline tests**, including original/hash/span
integrity, script alignment, internal negation, ellipses, repeated fragments,
partial words and snapshot replay. Automated UI and contract cases include legacy
reports, question-only/mixed text, explicit reanalysis, failed retries and hidden
technical metadata. These are software checks, not scholarly accuracy metrics.

`npm run check` passed **273 tests in 19 files**, typecheck, documentation/policy
checks, formatting and build on Node 24. Dependency audit reported zero
vulnerabilities. The build retains a non-failing approximately 635 kB chunk warning.

A third actual HTTP review for 112:1, absent from the snapshot directory,
retrieved both Muyassar and Saadi through the configured live MCP adapter. Its
report recorded `delivery: live` and complete transport coverage. An earlier
attempt returned the local commentary fallback; its transport failure cause was
not established. Inspection found an indefinite unavailable-response cache, now
bounded to 30 seconds with at most one attempt per reference in one intake.
An offline clock-controlled regression verifies later recovery without restart.

See [source services](../architecture/SOURCE_SERVICES.md) for the observed 17-tool
inventory and source acquisition receipt, and [Neon evidence](2026-10-04-neon-rag.md)
for real pgvector/migration checks and confirmed temporary-branch cleanup.

## Remaining delivery

In order: reviewed hosted corpus/ingestion, retrieval adapter and held-out recall,
bounded provider routing, claim extraction/support calibration, then AI-ReWrite.
Local source storage is still SQLite plus snapshots; Neon has no ingested real
corpus or embeddings. The successful hosted synthetic-vector test does not make
the UI's source adapter a Neon retrieval implementation.

No paid model calls, production migration, production source ingestion or release
was performed. Source-provider selection is approved by the user; digital-edition
audit, rights and attributed scholarly judgments remain distinct records.
