# AI Foundation handoff for Saleh's integration agent

Review the dependency pull requests first. Saleh (`smaq777`) owns acceptance,
merge and shared deployment. The local research configuration and data described
here are real, but are not automatically present in a Vercel/Railway deployment.

## Message to the integration agent

Current review instructions, 5 October 2026, 17:23 UTC: development `845d608`
includes owner #91 saved-result fallback. Review cleaning #85 (`845ae1a`), then
cache delivery #92 (tested code `53c757f`, documentation head `79ff315`), capacity
#95 (`a84ec9c`, preserving #91) and this handoff #87. Preserve owner ticket
migrations 0013/0014; deployment cleaning is 0015. Acceptance and deployment
remain Saleh's responsibility. Read the dated evidence and recheck exact-head CI.

For a missing database/RAG configuration, distinguish the report database
`basirah_integration_20261004` from Neon `basirah_research`. The latter is in
project `weathered-pond-44811639`; active research parent is
`br-wandering-unit-b24xqw5d`, and cleaned-cache UI testing uses isolated child
`br-little-pond-b2y5usie`. Server credentials are outside the repo in the owning
`Project_Code/AI_Foundation/.env`: `BASIRAH_CORPUS_DATABASE_URL`,
`BASIRAH_CORPUS_VERSION` and `BASIRAH_WEB_CACHE_DATABASE_URL` are mapped by the
local launcher to the corresponding `FOUNDATION_*` server variables. Do not
expect them in the clone, expose them through Vite or paste their values into
GitHub. Shared staging needs its own authorized server-side configuration and
Foundation assets; merging code does not provision them.

At 17:03 UTC the actual Vercel capabilities URL still returned 404, while Railway
was ready at migration 0014 with Foundation, research, semantic and rewrite
disabled and no live providers. Verify the UI proxy, hosted activation boundary,
assets and server environment under #69/#14/#20, then a fresh persisted report
through the shared UI. The current live research gate requires loopback;
review an explicit hosted profile before deployment. Follow the
[resumption checklist](../planning/AI_FOUNDATION_RESUME.md) for active #11 work.

Latest checkpoint, 5 October 2026, 16:48 UTC: owner development `661fef89` includes
#88/#89 direct human-ticket intake and contact validation. Cleaning draft #85 is
updated at `845ae1a`, preserving owner ticket migrations 0013/0014 and assigning
unapplied deployment cleaning 0015. Cache draft #92 at tested source `53c757f` has
51 files / 673 tests passing and includes #85 ancestry. Both remain for Saleh's
acceptance. The separate handoff draft is #87. Recheck exact heads and required CI.

The fresh loopback review on port 8773 delivered both cleaned cached parents,
six exact body windows and a real cached-source citation to Luna/Sol assessment.
This is new selected UI evidence, distinct from the earlier 8772 cache omission.
It does not activate shared hosting or establish general semantic accuracy.

PR #59, follow-ups #70–#78 and passage PR #80 are now merged. Preserve merge
commits into `development`; do not squash, force-push or close issues automatically.
The implementation branches have passed their documented checks. A working local
research run is separate from acceptance of the shared staging configuration.

At the read-only checkpoint on 5 October 2026, 15:36 UTC, #59, #70–#78 and #80
were merged into `development` (`0b13a8c5278efcf25126056f444119045b88c3db`).
Required quality, policy and dependency checks passed at their accepted heads,
including #80 head `d173de37`. Recheck GitHub rather than treating this checkpoint
as permanent status. Merge acceptance does not prove deployed configuration.

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

## Cleaning implementation and isolated validation

Cleaning is a separate, default-off implementation in PR #85 at reviewed commit
`845ae1a89b100e54c7faed61b487983464a4d5ae`, with 51 test files / 659 tests and
type, documentation, policy, formatting and build checks passing. The same Luna
request returns topics and exact block labels. Only model agreement plus a
structural navigation/audio check permits removal; article prose, citations,
exceptions, corrective footnotes and uncertain blocks remain. The immutable
original and its hash are preserved. The derived content windows are lexical;
existing vectors do not become cleaned vectors automatically.

The isolated cleaning child is `br-square-salad-b2mo9m2a`, endpoint
`ep-silent-butterfly-b213f5fo.c-6.eu-central-1.aws.neon.tech`, database
`basirah_research`, copied from the passage-validation child. It expires on
12 October 2026. It is not the active app or production branch.
Read-only checks verified the 86-passage corpus, 16 unchanged cached originals,
four indexed parents, eight windows/vectors and separate reader/writer roles.
The additive experimental `0013_source_content_views` migration passed checksum
and table/RLS checks. Actual passage insertion then failed with SQLSTATE `42702`, confirmed as a
PL/pgSQL variable/range-alias collision;
synthetic records were rolled back. No classifier calls or durable cleaned-page
records were produced. Preserve this failure; passing unit tests did not establish
database operation.

Current development contains `0013_secure_review_tickets.sql` and
`0014_direct_review_ticket_intake.sql`. Unapplied deployment cleaning uses
`0015_source_content_views.sql`; it preserves both owner migrations. Only the
advisory-lock and metadata labels differ from tested `ae11c0d` cleaning 0014.
The two isolated experiments and their applied checksums stay unchanged.

A fresh child `br-little-pond-b2y5usie`, direct endpoint
`ep-long-frost-b2ebbc7n.c-6.eu-central-1.aws.neon.tech`, database
`basirah_research`, was copied from the passage-validation parent. It expires on
12 October 2026. Ordered ticket 0013/cleaning 0014 migrations and all 14 actual-role
integrity checks passed there. Synthetic records were rolled back. The failed
child remains unchanged and is not the repaired test target.

Eight real joint Luna calls on four exact public originals returned valid results.
Pages 8880/8881 each removed 11 player/audio/unrelated footer blocks; repeats chose
the same removed IDs. The corrective footnote on 11647 and conditional discussion
on 19992 were retained whole. Topic labels varied on 8880, so this is selected
engineering evidence, not general semantic accuracy or scholarly approval.

Only first-repeat selections were admitted: four immutable views and eight exact
windows on the fresh child. All 16 original cache records and eight older windows
and vectors were read back unchanged. The real reader/enrichment adapter returned
six validated hints for 8880/8881 and left both no-removal controls identical.
This does not establish whole-UI delivery. No active app, parent, production or
owning environment was changed. Cleaning stays off until #17 delivery budgets and
an integrated UI test pass. Existing vectors have not been relabelled or regenerated.

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

The earlier reviewed integration checkout is
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
  that earlier run did not prove passage-window UI delivery. No owning
  `.env` file or active parent was changed.
- `http://127.0.0.1:8773/`: current cleaned-cache preview, source
  `53c757f1d4e7f3ccbf5a8bc5b0f511d154998acb`, in
  `Project_Code/Basira-worktrees/17-cache-delivery-diagnostics`. It uses isolated
  child `br-little-pond-b2y5usie` and process-only reader/writer overrides with
  passage/content flags enabled. Startup and fresh public report
  `fed992b6-9e99-49d5-aeb0-bd57b410c9b1` passed. Review took 14.081 seconds;
  all cache stages succeeded, with eight parent candidates, two selected/restored
  parents and six verified cleaned windows delivered to the actual assessor.
  The model cited Bin Baz 8881 and Muyassar 31:15. The independent audit recomputed
  original/window hashes, matched first-repeat classifier receipts and checked
  the exact cached citation inside a delivered window. No gap discovery was needed.
  External protocol/report/audit/screenshot are in
  `AI_Foundation/experiments/cache-delivery-diagnostics-2026-10-05`.

The port 8773 local report fixture remains migration 0009, with tickets disabled.
It is not a full current-ticket or deployment 0015 database-chain test. Its source
includes Saleh's ticket UI changes; hosted credentials/schema remain separate.
The selected report still includes unrelated candidate sources, and its scope
wording omits a negation preserved elsewhere. Claim relevance, compact evidence
and qualifier consistency remain priorities; successful delivery does not erase them.

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
Later [read-only cache diagnostics](../evidence/2026-10-05-cache-delivery-diagnostic.md)
delivered two cached parents and durable claim preferences through the actual
adapter; they do not explain or replace the earlier UI cache absence.
Navigation fragments remain in legacy windows. Default-off source-content
cleaning combines topic classification with exact block labels and retains
immutable originals, substantive text, citations and corrective footnotes.

At 16:32 UTC on 5 October, Vercel's user-facing capabilities URL still returned 404.
Railway readiness advanced to `0014_direct_review_ticket_intake`, and its
capabilities now include review tickets, but foundation review, semantic assessment,
research preview and rewrite remained off with no live providers. This proves
backend migration progress, not connected hosted AI. Recheck the selected proxy,
deployed revision, Foundation assets and server-only RAG/provider configuration
under issue #69; then validate a fresh persisted report through the actual UI.

Do not silently turn on new flags, ingest benchmark gold answers, approve source
editions, claim deployment or close acceptance issues based on this handoff.
