# Neon branch inventory and bounded cleanup

Related to [#8](https://github.com/smaq777/Basira-Hackathon/issues/8) and
[#81](https://github.com/smaq777/Basira-Hackathon/issues/81). This is an operational
inventory, not source approval or production acceptance. The 5 October 2026
metadata read selected only project `weathered-pond-44811639`
(`basirah-production`, `aws-eu-central-1`). Neon database branches are separate
from Git branches and local report databases.

## Retained branches

| Branch                                                                   | Purpose and verified use                                                                                                                                                                                                                                                                | Decision                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `br-frosty-bar-b2b1o0r9` (`production`)                                  | Default, primary and protected. Production data was not queried by this cleanup.                                                                                                                                                                                                        | Keep; no production, protection or endpoint change.                                                                   |
| `br-wandering-unit-b24xqw5d` (`basirah-research-corpus-20261005`)        | Owning research environment points here. Recorded research snapshot: 86 corpus passages and 16 pending public-page parents; database `basirah_research`.                                                                                                                                | Keep; active RAG parent.                                                                                              |
| `br-weathered-tooth-b2luwnxr` (`basirah-passage-index-preview-20261005`) | Retained passage experiment parent, used by the earlier port 8772 preview. Cleanup readback: 149 historical corpus memberships; the pinned active snapshot contains 86. Sixteen original parents, eight original windows and eight vectors remain. Parent of both cleaning experiments. | Keep; runtime and ancestry dependency remains. No automatic age-based deletion.                                       |
| `br-little-pond-b2y5usie` (`basirah-source-content-v2-preview-20261005`) | Corrected cleaning child used by previews 8773 and the isolated alias preview 8776. Audited 86/16 originals, four content views/eight windows and eight old vectors; historical child cleaning migration is `0014_source_content_views`, while deployment uses `0015`.                  | Keep; active validation data. Expiry `2026-10-12T18:00:00Z` requires an owner decision before reuse beyond that date. |

The pinned research corpus is
`794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`.
Pending public sources remain pending even when hashes, topics or delivery checks
pass. Original parents and previously indexed vectors are immutable.

## Deleted failed child

`br-square-salad-b2mo9m2a` (`basirah-source-content-preview-20261005`) is the
failed first cleaning experiment, a leaf under `br-weathered-tooth-b2luwnxr`.
At the metadata checkpoint it was neither protected, default nor primary, with
expiry `2026-10-12T18:00:00Z`. An idle compute alone is not proof of disuse.

Read-only comparison found all 16 original public-parent identities and evidence
hashes equal to the retained passage parent, and the eight old window/vector
records equal. The failed child has zero content views and zero content windows.
Its actual failed validator was preserved externally and matched the historical
SHA256 `b8510e49c5aeebe3f9d2c0bc7d0edf814442d56aa900471c62e197cd5fabefee`.
The failure is SQLSTATE `42702`: the declared PL/pgSQL variable `r` collided with
the retained-range query alias. Historical source `0c04dcfd116c93ab73d76e75f4a5a9d9aa8272be`
and the original migration/failure receipts remain unchanged.

The copied `basirah` and `basirah_passage_empty` databases also have identical
application/private table counts and server-computed row hashes on both branches;
no report content was persisted by the comparison. The lead confirmed that the
failed child was never a managed app target. Owning configuration and declared
local launchers contain no failed-child connection reference.

Deletion completed on 5 October after the user-authorized, exact lead release.
The failed branch and its endpoint are absent in actual API readback. The four
retained branch identities, parents and protection flags are unchanged. Before
and after hashes/counts for corpus membership and all available cache, passage,
vector and content-view tables on the three research branches are identical.
Production SQL queries, source/schema writes and environment writes were zero.
One branch was deleted.

The first
strict session gate retained three idle `cloud_admin`/`postgres` loopback clients:
`compute_ctl:compute_monitor`, `vm-monitor`, and `neon_compute_sql_exporter`.
The lead reviewed these exact platform tuples. The fresh final gate permitted
only these names with the same login/database, idle state and loopback addresses;
every unknown client would block deletion. The initial
read-only probe failures are retained: the passage parent lacks cleaning tables,
and direct private-schema function name resolution is denied to the reader. The
successful final probe used catalog lookup without adding privileges.

## Reports and RAG are different databases

Local reports on `127.0.0.1:55439/basirah_integration_20261004` are not Neon RAG
data. The separate alias UI fixture uses portable PostgreSQL 18 on
`127.0.0.1:55441/basirah_selection_ui_v1`, with distinct least-privilege runtime
and worker logins. The preview uses `basirah-selection.localhost:8776` to preserve
the old localhost guest cookie and quota. Neither local database is a cleanup
candidate. Changing ports alone does not isolate host cookies.

Credentials belong in the owning environment. Do not copy connection strings,
passwords, guest cookies, user report text or personal data into this inventory.
The alias preview binds the corrected Neon child in memory with verified TLS and
read-only default transactions; it does not change the owning `.env` or parent.

## Safe cleanup and recovery boundary

1. Read current metadata for this exact project and branch ID. Reject default,
   primary, protected branches, any branch with children, or an ambiguous use.
2. Check the owning configuration and declared live preview bindings. Have the
   operator stop only a positively identified obsolete preview if needed; never
   guess processes or clear shared roles, quotas or report sessions.
3. Preserve unique source/schema/failure evidence before deletion. Compare actual
   data against the retained parent; a hash-only receipt does not replace a
   necessary backup of unique data.
4. Freeze the exact candidate ID, proof hashes and reviewed release. Re-read
   metadata immediately before deletion and refuse a changed identity/parent or
   new child. Delete only the released branch, never the parent or project.
5. Read metadata afterward: the candidate and its endpoint must be absent, and
   all retained branch identities unchanged. Record the actual outcome, including
   failure; do not retry an uncertain deletion automatically.

Branch deletion is irreversible for this workflow. Historical receipts and Git
source preserve reproducibility of this failed selected experiment; recreating a
new child gives a new branch/endpoint identity, not the deleted branch. Retain the
passage parent and frozen source so an owner can explicitly reproduce the failure
later, without rewriting applied migration history.

The [official Neon branching workflow](https://neon.com/docs/get-started-with-neon/workflow-primer)
documents branch isolation and the CLI branch-delete operation. Runtime identity,
data and deletion decisions above are project-specific observed evidence.

External, credentials-free operational receipts are under
`AI_Foundation/experiments/neon-branch-cleanup-2026-10-05`: `INVENTORY_V1.json`,
`CANDIDATE_DATA_PROOF_V3.json`, `AUXILIARY_DATABASE_PROOF_V1.json`,
`FINAL_CANDIDATE_PREFLIGHT_V1.json`, `FINAL_CANDIDATE_PREFLIGHT_V2.json`,
`PRESERVATION_MANIFEST_V1.json`, `DELETION_PROTOCOL_V1.json`,
`DELETION_RECEIPT_V1.json`, and `FAILED_CHILD_VALIDATOR_V3.sql`.
These paths describe retained local evidence; they are not committed source data.
