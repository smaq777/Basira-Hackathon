# Selected Neon branch cleanup — 5 October 2026

Related to [#8](https://github.com/smaq777/Basira-Hackathon/issues/8) and
[#81](https://github.com/smaq777/Basira-Hackathon/issues/81).
The user requested a durable inventory of used Neon branches and deletion of
unused branches. The [inventory/runbook](../operations/NEON_BRANCH_INVENTORY.md)
records the exact four retained branches, use, expiry and recovery boundaries.

Only `br-square-salad-b2mo9m2a` in project `weathered-pond-44811639` was deleted.
This was the failed first cleaning experiment, not the corrected active child.
The lead reviewed the exact candidate and release after fresh metadata/data/client
proof. No shared role, production branch, source, schema or owning environment
was changed. Branch deletion is not reversible in this workflow.

## Observed proof

- Five initial branches; candidate was an unprotected, non-default, non-primary
  leaf under the retained passage parent. Operator-managed apps never targeted it.
  Owning configuration and declared local launchers did not reference it.
- Sixteen public originals and evidence hashes, eight old windows/vectors, and
  copied auxiliary-database application/private row hashes matched the parent.
  The failed child had zero content views/windows. Total historical memberships
  were 149; the active pinned corpus has 86, not 149 active passages.
- Actual failed validator hash matched the historical SQLSTATE `42702` diagnosis.
  The failed function, original migration source at `0c04dcfd116c93ab73d76e75f4a5a9d9aa8272be`,
  and original frozen execution/failure receipts remain retained externally.
- A fail-closed first client gate retained three platform-monitor sessions.
  After exact lead review, a fresh gate permitted only the observed
  `cloud_admin`/`postgres`, idle, loopback tuples with the three named monitor
  applications. No unknown application session was present or terminated.
- CLI deletion succeeded once. Readback found the candidate and its endpoint
  absent, the four kept branch identities unchanged, and all six available
  corpus/cache/window/vector/content table signatures on the three retained
  research branches equal before/after. Production data was not queried.

The initial read-only proof failures are retained: absent cleaning tables on the
passage parent, then denied private-schema name resolution. Catalog lookup fixed
the latter without granting privileges. These were harness failures; they did
not change SQL or justify skipping a safety check.

## Receipts and limits

External receipts are in
`AI_Foundation/experiments/neon-branch-cleanup-2026-10-05`:
`INVENTORY_V1.json`, `DATABASE_INVENTORY_V1.json`,
`CANDIDATE_DATA_PROOF_V4.json`, `AUXILIARY_DATABASE_PROOF_V2.json`,
`FINAL_CANDIDATE_PREFLIGHT_V2.json`, `PRESERVATION_MANIFEST_V1.json`,
`DELETION_PROTOCOL_V1.json` and `DELETION_RECEIPT_V1.json`.
No credentials, user reports or copied corpus text are committed.

This selected operational cleanup does not approve pending sources, establish
staging/production readiness, repair the historical experiment, or complete
owner acceptance. The corrected active child expires on 12 October; preserving
its future runtime availability needs an explicit operator decision. No other
branch is scheduled for deletion by this change.
