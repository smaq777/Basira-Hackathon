# AI Foundation handoff for Saleh's integration agent

Review the dependency pull requests first. Saleh (`smaq777`) owns acceptance,
merge and shared deployment. The local research configuration and data described
here are real, but are not automatically present in a Vercel/Railway deployment.

## Message to the integration agent

Please review PR #59 and follow-ups #70–#78, then passage PR #80. Preserve merge
commits into `development`; do not squash, force-push or close issues automatically.
The implementation branches have passed their documented checks. A working local
research run is separate from acceptance of the shared staging configuration.

At the read-only checkpoint on 5 October 2026, 13:53 UTC, #59 and #70–#72 were
merged into `development` (`809baeed63a9e70c5e1d79a7d010e7f12ed6db4d`). Review the
remaining #73–#78 before #80; recheck GitHub rather than treating this checkpoint
as permanent status. Required checks passed at #80 head `48acf4a`.

The RAG database is **not the application's `DATABASE_URL`**. That variable stores
documents, jobs and reports. The RAG reader uses `FOUNDATION_CORPUS_DATABASE_URL`
and a pinned `FOUNDATION_CORPUS_VERSION`. A separate pending public-page cache
uses `FOUNDATION_WEB_CACHE_DATABASE_URL`. These server-only credentials come from
the owning environment; they are intentionally absent from Git and browser code.

The local owning file is `Project_Code/AI_Foundation/.env`, outside the cloned
repository. Its `BASIRAH_CORPUS_DATABASE_URL`, `BASIRAH_CORPUS_VERSION` and
`BASIRAH_WEB_CACHE_DATABASE_URL` are mapped to the runtime `FOUNDATION_` names by
the local launcher. On a different machine, supply corresponding credentials
through the approved server environment; do not commit or paste connection strings.
Source review and CI do not require access to those secrets.

## Exact data locations

| Purpose                                   | Location and identity                                                                                                                                                                                   | Verified contents / boundary                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local report/job database                 | PostgreSQL 18, loopback port `55439`, database `basirah_integration_20261004`                                                                                                                           | Report runtime and worker use separate `bridge_runtime` / `bridge_worker` logins. This is local durable report storage, not the Neon RAG collection.                                                       |
| Active research RAG and public-page cache | Neon project `weathered-pond-44811639`, branch `br-wandering-unit-b24xqw5d`, database `basirah_research`, endpoint family `ep-fancy-base-b2o8zdbw`                                                      | 86 corpus passages/vectors and 16 separately cached public originals at the recorded checkpoint. The passage migration experiment did not modify this parent.                                              |
| Isolated passage-index validation         | Same project, child `br-weathered-tooth-b2luwnxr`, named `basirah-passage-index-preview-20261005`, direct endpoint `ep-quiet-rain-b26xkxhg.c-6.eu-central-1.aws.neon.tech`, database `basirah_research` | Final pre-UI readback: same 86 corpus passages and 16 original cache parents, four indexed parents, eight exact windows and eight passage vectors. Non-default, non-primary, non-protected research child. |
| Production/default branch                 | `br-frosty-bar-b2b1o0r9`                                                                                                                                                                                | Not modified by this passage experiment. Do not expect the research pilot to appear here or apply migrations here to reproduce a local test.                                                               |

Pinned corpus version:

```text
794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff
```

The 86-passage snapshot contains 52 Quran, 27 Tafsir, four Hadith, one book and two
scholar passages. This is a selected research collection, not the complete local
corpus. Cached public pages remain pending research sources; topic classification,
allowlisted domains and checksums do not establish scholarly or edition approval.

The app also needs the local Python foundation adapter and its declared Quran
index (`data/derived/evidence-tanzil.sqlite`) and source-service snapshots in
`AI_Foundation`. They are acquisition/resolution inputs, distinct from Neon. Live
Tafsir acquisition and approved web discovery supplement gaps. Installing an MCP
plugin alone does not populate these databases or configure the application.

## Runtime identities and schema

- `FOUNDATION_CORPUS_DATABASE_URL`: existing `basirah_corpus_reader` login,
  with the `basirah_research_runtime` role; verify-full TLS.
- `FOUNDATION_WEB_CACHE_DATABASE_URL`: distinct `basirah_page_cache_writer`
  login with `basirah_cache_writer` capability; no canonical-corpus approval.
- Offline passage CLI uses distinct `FOUNDATION_PASSAGE_READER_DATABASE_URL`
  and `FOUNDATION_PASSAGE_WRITER_DATABASE_URL` on the same direct host/database.
  Do not grant owner/writer membership to work around a wrong connection.
- Canonical research tables are `basirah.passage`, `basirah.corpus_snapshot`,
  `basirah.source_edition` and `basirah.passage_embedding`.
- Pending pages live in `basirah.research_page_cache`; optional passage metadata
  and vectors live in `basirah.research_page_passage` and
  `basirah.research_page_passage_embedding`.

Migration 0010 supplies the research cache. Optional passage indexing needs 0011
plus forward fix 0012; the applied 0011 bytes/checksum stay unchanged. Fresh copied
databases encountered cluster-role creation failure in historical 0008, retained
under [issue #81](https://github.com/smaq777/Basira-Hackathon/issues/81). Do not drop
copied roles, rewrite migration history or run production migrations to bypass it.

Use the database's checked-in migration metadata and the existing verification
script. To inspect the selected corpus without writing:

```sql
BEGIN READ ONLY;
SET LOCAL ROLE basirah_research_runtime;
SELECT count(*) AS passages
FROM basirah.corpus_snapshot
WHERE corpus_version = '794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff';
SELECT count(*) AS visible_cached_pages FROM basirah.research_page_cache;
ROLLBACK;
```

Cache visibility depends on expiry, revocation and policy. These checkpoint counts
are not permanent health guarantees. Connection/provider names in capabilities
indicate configuration; they do not certify current provider availability.

## Local activation versus shared staging

The reviewed integration checkout is
`Project_Code/Basira-worktrees/14-next-priority-validation`, currently merged through
`7b080546ad27a81ff29f77f9b9f1c480c5a037c7`. Its combined check passed 48 test files,
617 tests, type checking, documentation, policy, formatting and build.

- `http://127.0.0.1:8771/`: existing integrated research app using the active
  research parent; passage indexing is off in that process.
- `http://127.0.0.1:8772/`: separate passage preview using ephemeral child
  connection overrides. A fresh persisted UI review
  `0bb5b9ff-fbbd-4854-84f5-ec86b882dfce` reached the pinned Neon corpus, completed
  Luna claim extraction and Sol assessment, and supported the public obedience
  claim with Muyassar 31:15 while preserving its conditions and negation.
  The report contained no cache-parent candidates or preferred cache windows:
  actual passage-window delivery through the UI remains unproven. No owning
  `.env` file or active parent was changed.

All research/provider flags default off. Current live semantic/retrieval/discovery
activation requires a non-production loopback research preview. It cannot simply
be copied into a public production process. Review the staging boundary and API
proxy in PR #71 / issue #69, choose an explicitly permitted hosted profile, then
verify a fresh report through the actual shared UI after owner acceptance.
`/ready` alone does not prove RAG retrieval or semantic assessment. See
[setup](SETUP.md), [passage evidence](../evidence/2026-10-05-cache-passage-index.md)
and [current delivery priorities](../planning/AI_FOUNDATION_NEXT.md).

## Retrieval evidence and remaining limitations

The frozen isolated paid comparison retained 20 embedding attempts, including one
transport failure. A passage-first parent ranking was rejected because it demoted
a relevant unindexed title. The correction preserves legacy parent order and
enriches matched parents with exact windows, filling vacant slots only. Zero-provider
replay preserved 24 ranking pairs, all four unindexed rank-one controls and the
failed vector; a selected full qualification paragraph was delivered four times
where the legacy excerpt missed it. This is engineering evidence, not general
retrieval recall, religious accuracy or stronger-thinking superiority.

Three historical cold-cache diagnostic arms lost cached delivery. The configurable
budget and explicit partial-outcome follow-up is [issue #17](https://github.com/smaq777/Basira-Hackathon/issues/17).
Navigation fragments remain in some windows. A separate default-off source-content
cleaning task will combine topic classification with exact block labels and retain
immutable originals, substantive text, citations and corrective footnotes.

Do not silently turn on new flags, ingest benchmark gold answers, approve source
editions, claim deployment or close acceptance issues based on this handoff.
