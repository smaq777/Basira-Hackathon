# Copied-role bootstrap — 5 October 2026

Related to #81. Tested source `dc1c7de7a9c91366fb8b7f8b164a16ad7280136c`
preserves owner development `f130560` and every historical SQL file/checksum.
The opt-in runner segments frozen 0008 at its role declaration and uses a
savepoint to reuse only a compatible existing role. Canonical metadata and a
separate immutable execution receipt commit atomically. Strict remains default.
See the [operator runbook](../operations/COPIED_ROLE_BOOTSTRAP.md).

## Software checks

Targeted 56 tests and full 51 files / 661 tests passed, with type checking,
documentation, policy, formatting and build. Initial missing declaration/strict
fixture typing failures were corrected before the source freeze; their logs are
retained. These checks do not themselves prove SQL operation or hosted readiness.

Owner development `c33f83c8b8c3a6e06d466d5c12d13c9f8952c9ac` was subsequently
preserved by merge commit `46fd2354384dbb8a88b5946b3ab8f359403f4321`.
The bootstrap source and historical migrations did not change in that merge.
Full checks passed again: 51 files / 662 tests, type checking, documentation,
policy, formatting and build (`FULL_CHECK_OWNER_C33_V3.log`). The extra test is
from the owner's ticket-notification work. The actual SQL evidence below remains
bound to the earlier recorded source freeze, rather than claiming a new SQL run.

## Actual PostgreSQL validation

Official pgvector `v0.8.7`, source `f37c13f68b57d2c3472b2214fbcff699d6d34876`,
compiled against installed PostgreSQL 18 headers. System installation was denied
by OS file permissions and copied zero files. A workspace-only portable copy of
the installed vendor binaries and compiled extension runs a new loopback cluster
on port 55441; existing PostgreSQL/app databases were untouched.

All actual checks used that new cluster, public synthetic data and no external
providers or Neon writes. Exclusive protocol, logs and readbacks are external in
`AI_Foundation/experiments/bootstrap-validation-2026-10-05`.

- Genuinely empty cluster/database: strict historical chain 0001–0014 passed;
  readiness reports 0014 and pgvector is 0.8.7.
- Fresh database in that cluster: strict runner reproduced SQLSTATE 42710 at
  0008 after seven committed migrations. The first failure/readback is retained.
- Explicit compatibility recovery of that same database passed through 0014.
  Every canonical version/checksum matched the successful strict database.
  The separate receipt records `reused` and the tested runner-file hash.
- An explicit complete-chain rerun applied zero migrations; canonical and
  execution receipts were byte-equivalent in retained JSON readback.
- Other-database synthetic original text, its SELECT grant, cluster-role
  attributes and all memberships were equal before/after compatibility recovery.
- Twelve actual transactional controls passed: seven unsafe role attributes and
  outbound group membership rejected; incoming runtime membership accepted;
  execution-receipt update/delete rejected even for owner; runtime receipt access
  denied. Every mutation rolled back, with equal role/receipt readback hashes.
- A separate empty `basirah_selection_ui_v1` report fixture completed the same
  chain. Distinct least-privilege runtime/worker logins have only their respective
  group membership. Initial sessions/documents/revisions/runs are all zero.
  The official database verifier passed with its runtime login; probes rolled back.

## Limits and acceptance

This validates PostgreSQL 18 operation and complete owner-development chain 0014.
It is not a fresh Neon branch or proposed cleaning 0015 chain run. The helper's
`created` receipt branch has deterministic coverage; actual compatibility runs
here reused existing roles, while the genuinely empty strict run created them.
No shared service, owning environment, production role or original corpus changed.
Fresh local storage supports separate UI tests; it does not reset the existing
quota-limited session. Those model/UI results are separate evidence.

Saleh owns acceptance and deployment. Keep the recorded failure and historical
SQL/checksums. Disable the opt-in for strict behavior; use forward migrations
after successful bootstrap rather than dropping shared roles or receipts.
