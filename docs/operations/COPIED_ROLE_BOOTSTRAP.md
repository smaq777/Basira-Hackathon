# Fresh database bootstrap with existing cluster roles

Related to #81. PostgreSQL roles belong to the cluster, so a fresh database in a
copied Neon branch can encounter an existing `basirah_research_runtime`. The
historical 0008 declaration is unconditional. Its SQL and all historical
checksums remain unchanged.

The migration runner defaults to `MIGRATION_ROLE_BOOTSTRAP=strict`, preserving
the historical execution path. An owner-reviewed migration operator may select
`existing-roles-v1` for an isolated validated target using its direct owner
connection. Do not enable it through browser input or use a pooled connection.

The opt-in first validates existing Basirah group roles: no login, superuser,
database/role creation, replication, inheritance or RLS bypass; no outbound group
membership. Incoming runtime-login memberships are preserved. It never alters,
drops or replaces cluster roles or changes memberships. An incompatible role
stops bootstrap for operator investigation; it is not repaired automatically.

Only frozen migration 0008 is segmented around its exact role declaration. A
savepoint admits SQLSTATE 42710 only, then validates the existing role within the
transaction. Other failures roll back and stop. The unchanged remaining SQL runs,
and the canonical migration checksum commits atomically with an RLS-protected
immutable `basirah_private.migration_execution_receipt`. The receipt records the
explicit profile, source checksum, execution-plan hash, runner-file hash, verified
role attributes and `created`/`reused` action. It is not a claim that execution
was byte-identical to the original one-query path. Applied migrations retain
their original checksum checks and are never rerun to add a receipt.

Run the complete checked-in chain, then `npm run db:verify` with the intended
runtime identity and inspect readiness/receipts. A successful 0008 or unit test
alone does not prove a complete database. Rerunning a completed chain must leave
canonical and execution receipts unchanged. Shared deployment remains Saleh's
decision.

Rollback: before commit, all current migration changes and its receipt roll back.
Previously committed migrations remain; do not delete them or drop shared roles.
Disable the opt-in to restore strict runner behavior. After a successful bootstrap,
retain its receipt and use reviewed forward migrations for further changes.

Actual fresh/copy-role validation evidence is pending and must be recorded before
owner acceptance. Default tests use synthetic clients and no external database.
