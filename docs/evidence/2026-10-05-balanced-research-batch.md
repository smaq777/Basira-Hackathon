# Bounded multi-topic research corpus pilot (issue #8)

This pilot compiles 24 new, attributed original units into a separate 86-member research snapshot: the unchanged 62-member baseline plus 12 Tanzil Quran verses and their 12 complete publisher Muyassar commentary units. It is a small implementation slice of the [expansion plan](../planning/RAG_EXPANSION_PLAN.md), not completion of its proposed 170-unit batch or nine-topic coverage target. Every source remains pending approval and research-only.

## Reproducible compiler

`scripts/prepare-research-batch.ts` reads the owning Foundation SQLite index in read-only mode. Its arguments are the Foundation root, frozen baseline manifest, external reference/seed plan, and a new staging output path. It verifies each complete indexed original's text hash, exact locator and role, its raw publisher file byte hash, and quarantine status. Complete adjacent units from the same source are retained as context, with original hashes and locators in provenance. The full `2:282` verse and commentary are retained; the longest selected original is 1,466 UTF-16 characters. Search representations remain separate from originals, and Muyassar's original HTML is preserved. New Quran units index their canonical originals; attributed publisher auxiliary spellings remain in provenance without indexing. Commentary also retains its existing separate plain-text search representation.

Acquisition relies on the owning Foundation's existing index and documented raw-field extraction recipe; matching a raw-file hash does not independently reparse and certify every XML/TSV field. The compiler's `originalRecord` binding is a consistency check against that acquired full unit, not an authenticity or scholarly completeness judgment. Reference validation has coarse numerical bounds; actual locator availability is checked in SQLite.

`scripts/compile-research-batch.ts` accepts the external staging input after classification and writes a new manifest without overwriting an existing file. The typed compiler:

- Rejects rewritten originals, mismatched hashes, roles, versions or locators, unknown origins, and changed attribution or rights for reused editions.
- Requires additions to match an existing Tanzil or Muyassar edition in the baseline; it does not ingest benchmark questions, answers or gold judgments.
- Binds every commentary to its same-reference Quran parent and rejects absent relation targets.
- Coalesces identical repeated input identities, rejects conflicting identities, and retains equal text at different attributed locators.
- Preserves baseline source objects unchanged, bounds additions to 40 units, and derives a content-addressed union version from the complete source objects and classification proposals. Input ordering does not change the output.

Classification is a separate, bounded call using the existing `public-page-topics-v1` small-model contract. Each proposal retains model/prompt identifiers and request/response hashes. Embeddings bind exact original hashes to the existing 1,536-dimensional `openai/text-embedding-3-small` document space; 62 existing vectors are reused and 24 new vectors are generated. Topics and source kinds remain separate fields. Neither labels nor vectors approve a source or establish claim support.

## Selected units and proposed labels

| Seed topic   | New verse references (each with its full commentary) |
| ------------ | ---------------------------------------------------- |
| aqidah       | 2:163, 112:3                                         |
| worship      | 2:43, 22:78                                          |
| ethics       | 16:91, 49:13                                         |
| family       | 4:19, 31:15                                          |
| transactions | 2:275, 2:282                                         |
| biography    | 12:4, 28:7                                           |

There are four new units per seed group. Actual unreviewed model proposals are multilabel: aqidah 7, worship 4, ethics 6, family 4, transactions 5, quran_exegesis 19, biography 0, hadith_studies 0, other 0. The biography seed/proposal mismatch remains visible and unreviewed. Quran and Tafsir source kinds can both receive quran_exegesis proposals; source kind does not impose that topic. These counts do not establish balanced coverage over the topic registry.

## External artifacts and isolated destination

Raw data, vectors, manifests and live receipts remain outside this Git repository in the owning Foundation's `experiments/balanced-research-batch-2026-10-05/` directory. The retained `plan.json`, `staging.json`, `compiler-input.json`, `prepare.mts`, per-original `topic-*.json`, `new-embeddings.json`, `embedding-receipt.json`, `compile-diagnostics.json` and `branch-identity.json` reproduce acquisition, classification and compilation. Parent-owned `RETRIEVAL_PROTOCOL.json` and before/after diagnostics evaluate locator coverage without injecting expected answers into retrieval.

The union manifest version is `794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`; the frozen baseline version is `8f37095c9674921c21ba13e99b745cc671c039a6526aac76642376af67c6db52`. The reviewed destination is project `weathered-pond-44811639`, branch `br-wandering-unit-b24xqw5d` (parent `br-frosty-bar-b2b1o0r9`), database `basirah_research`. Identity verification confirms the branch is neither default, primary nor protected. Credentials remain in memory and are omitted from receipts. Ingestion uses the existing schema and owner role; production, schema, roles, source approval and active environment configuration are unchanged. This snapshot is not activated in the application.

## Verification

Nine focused tests exercise original mutations, raw-file drift, locator mismatch, quarantine, duplicate identities, ordering, missing/wrong parents, unknown topics and changes to source IDs, versions or rights. All 535 source tests across 37 files pass with `vitest run --pool=threads --exclude '**/dist/**'`; project typechecking, explicit compiler-script typechecking, documentation/policy/format checks and the API/web build pass. The web build retains its existing large-bundle advisory.

Independent pre-ingestion review checked all 24 complete originals, 46 adjacent-context links, both raw publisher file hashes, and byte-equivalent source/vector objects for the baseline 62. The reviewed manifest was ingested and replayed only in the isolated branch. The initial post-write verifier incorrectly compared the Quran reader's intentional null author with the publisher attribution `Tanzil Project`; `ingestion-verification-failure.json` retains that harness failure. A subsequent verification-only run corrected the projection check and independently verified stored publisher attribution. Insertion/replay counters were not saved before the initial assertion and are not reconstructed as observed counts.

`ingestion-receipt.json` confirms the baseline still has 62 passages/vectors, its originals and metadata remain unchanged, and the new snapshot has 86 passages/vectors. All 24 new originals, same-verse parents and neighboring context roundtrip unchanged. The production reader sees zero members of the pending snapshot. The restricted research reader can read passages but cannot insert them, approve editions, or access report API schemas.

The frozen `RETRIEVAL_PROTOCOL.json`, `BEFORE_RETRIEVAL_RECEIPT.json` and `AFTER_RETRIEVAL_RECEIPT.json` measure selected-locator engineering coverage: expected locators for the 12 new seed queries move from 0/12 to 12/12 in lexical and hybrid top-eight results and in exact-reference retrieval. Independent restoration checked all 86 original hashes, references, versions and reader projections. These selected seed probes are not held-out semantic accuracy or claim-support judgments. Unrelated and invalid-reference controls still produce eight hybrid candidates; invalid exact-reference retrieval produces zero. Candidate retrieval does not establish support. The 86-member snapshot remains unactivated in the application.
