# Persistent typed Neon development corpus

Issue #8 and source dependencies #5/#6/#7 now have an isolated, persistent
development corpus. This is engineering evidence; every ingested edition remains
pending, rights review is incomplete, and no scholarly approval is implied.

## Hosted state verified on 5 October

- Existing project: `weathered-pond-44811639`.
- Durable branch: `basirah-research-corpus-20261005`
  (`br-wandering-unit-b24xqw5d`), parent protected production
  `br-frosty-bar-b2b1o0r9`. No expiration is configured.
- Development database: `basirah_research`; compute `ep-fancy-base-b2o8zdbw`,
  0.25 CU, suspend after 300 idle seconds. Production was not modified.
- Fresh database verifies the unchanged historical migration checksums and the
  complete chain through `0009_versioned_corpus_membership`; pgvector is `0.8.6`.
- Corpus version:
  `8f37095c9674921c21ba13e99b745cc671c039a6526aac76642376af67c6db52`.
- **62 immutable passages and 62 compatible embeddings**: 40 Quran originals,
  15 Tafsir explanations, 4 attributed hadith dataset passages, 1 scholarly book
  excerpt and 2 scholar explanations. These are source records, not accuracy or
  authenticity labels.
- **18 typed cross-work links** preserve supplied commentary anchors and explicit
  verse citations. A citation link does not imply that two passages agree.

The local prior 31-evidence intake and three owner-supplied public page captures
are retained in the owning `AI_Foundation` experiment directory. The pilot's
40 Quran originals and compatible vectors were reused. The 22 remaining
originals received `openai/text-embedding-3-small` vectors at 1,536 dimensions
through the OpenAI provider; observed usage was 9,879 tokens and reported cost
$0.00019758. Model, dimensions, document task, original hash and corpus version
must match; dimensions alone never identify an embedding space.

Original corpus text, embeddings, source capture files and credentials are not
committed. External artifacts are under
`Project_Code/AI_Foundation/experiments/hosted-corpus-2026-10-05/`:
`manifest.json`, `embedding-receipt.json`, `REPORT.json` and
`RUNTIME_REPORT.json`. The official Neon CLI refreshed the existing authenticated
session. No replacement account or project was created.

## Runtime and persistence checks

The dedicated `basirah_corpus_reader` login has no inherited administrative role,
superuser, database creation, role creation or RLS bypass privilege. It can select
pending/approved sources only after entering `basirah_research_runtime`.
It cannot insert passages, approve editions, or access the review API schema.
Its pooled DSN is stored only in the owning `AI_Foundation/.env` as
`BASIRAH_CORPUS_DATABASE_URL`; `BASIRAH_CORPUS_VERSION` binds the fixed corpus.

Actual database checks proved:

1. A committed ingestion and an identical replay both preserve all 62 originals,
   vectors and typed links; a fresh connection reads the committed corpus.
2. The approved production runtime sees **zero** pending corpus passages.
3. All 31 previous intake snapshots round-trip original text/hash, original
   source identifier, version, role, reference, author, edition, URL and parent.
4. Claim queries retrieve the prior Tawhid evidence gaps without hardcoded
   snapshot IDs. Reference anchors reserve candidate capacity for new lexical
   and semantic evidence; related Tafsir originals are restored through links.
5. A real compatible query embedding produces hybrid candidates, including
   scholarly explanations. Original citations remain unchanged.
6. The actual lease-bound `complete_review` function persists both new truthful
   source roles with all prior binding checks intact. The synthetic report
   transaction is rolled back; corpus ingestion remains committed.
7. A second development corpus version reuses the same book original and cached
   compatible vector, commits and replays idempotently, and reads through the
   least-privilege login. Immutable source identity is shared across versions;
   each version's membership and embedding compatibility remain distinct.
   An attempted replay that changes surrounding context under the same snapshot
   identity is rejected and rolled back.
   Changing a reused snapshot's typed relation set or attribution is also rejected;
   the isolated Neon mutation attempt left no new relation behind. Relation output
   order is deterministic, and explicit original parent anchors take precedence.

Migration `0008` extends passages with explicit roles, provenance, surrounding
context, footnotes and corpus identity. Existing passage/embedding immutability
triggers protect the additional fields. Typed cross-work links are immutable
and obey both-endpoint RLS visibility. Old passages retain unknown roles and are
excluded from typed corpus retrieval rather than assigned a fabricated type.
Migration `0009` separates corpus membership from original passage identity,
so a new version can reuse a frozen source snapshot without mutating it.

## Operational use and rollback

### Integrated current-UI run

The local Basira-Hackathon app was rebuilt and restarted with the dedicated Neon
reader and semantic research flags. A browser reanalysis of the supplied writing
persisted review `16f292d2-48af-48ab-9c1a-c7e7d1de28e5` in **62.069 seconds**.
It preserved all 12 quotation findings, expanded the evidence packet from 31 to
36 rows, and completed five selected claims as provisionally supported with
13 validated exact citations. Both scholar explanations and the book excerpt
were retrieved without hardcoded query-to-source mappings. The overall report
remains partial because quotation/source limitations are separate from completed
semantic assessment; one wording mismatch and one unresolved quotation remain.

Extraction took 8.325 seconds and assessment 26.309 seconds; reported model costs
were $0.00182405 and $0.1331235, excluding query embeddings and source acquisition.
One generated explanation contained the English token `supplied` inside Arabic
prose, retained in the immutable result rather than silently edited. User-facing
language consistency needs further evaluation. This single successful run is not
an accuracy, latency guarantee or scholarly acceptance result.

The first integrated trial timed out during serial retrieval and preserved its
31-source quotation report without a semantic verdict. Its four extracted claims
were replayed through bounded three-way search and a single context-restoration
call in 4.743 seconds. Dense retrieval became available after accepting the
provider's equivalent bare model-name response; requests remain pinned to the
same OpenAI model. All original time budgets remain unchanged. Both the initial
failure and corrected profile are retained in external experiment receipts.

Local report storage remains the existing PostgreSQL workflow fixture; canonical
quotation lookup still uses the pinned local index and Tafsir acquisition. The
new claim corpus and vector queries use Neon. Local migrations 0008/0009 were
applied after verifying documented historical fixture substitutions and LF/CRLF
equivalence, without rewriting previous SQL or recorded checksums. The unchanged
complete migration chain was separately verified on the isolated Neon database.

External evidence includes `ui-neon-report.json`, `ui-neon-summary.json`, the
initial-timeout receipts, retrieval profile and `NEON_UI_RESULT.png`.

Validate an external typed manifest without provider/database calls:

```powershell
npx tsx scripts/ingest-source-corpus.ts <external-manifest.json> --validate-only
```

Administrative ingestion requires a direct `DATABASE_URL_UNPOOLED` and explicit
`SOURCE_CORPUS_ISOLATED_BRANCH_CONFIRMED=true`. It accepts pending research
sources only, validates exact original/footnote hashes and embedding bindings,
locks and commits atomically, and rejects identity-changing replay. Source
approval remains a separate reviewed operation. Follow repository migration
policy and verify the Neon branch identity before applying changes.

Disable claim retrieval and the research preview flags to stop using this corpus;
the durable branch remains available for review/replay. Correct originals or
provenance through a new reviewed source/corpus version and forward migration,
never by rewriting immutable records or historical migrations. Do not promote
this development corpus or grant its research role to production. Keep the
branch until the owner explicitly approves cleanup.
