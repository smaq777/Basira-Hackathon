# Current-UI source review: local integration evidence

Related to #14. Branch: `saleh/14-foundation-ui-integration`, based on development
commit `05033e0`. This is implementation/validation evidence, not acceptance,
deployment or religious-accuracy evidence. The lead reviewed the foundation and
coordinated separate Sol agents for backend, current UI and portable Python code.

## What changed

- The existing Basira-Hackathon UI submits an immutable guest revision, queues a
  durable review and displays its persisted owned source report. Refresh restores
  the report. Real errors are surfaced without demonstration-result substitution.
- The Python source runtime is packaged in this repository with provenance hashes
  and offline tests. Original corpus files and captured provider responses remain
  outside the repository. Its quotation adapter includes the partial-word and
  repeated-alignment guard from the reviewed foundation.
- Migration 0006 adds bounded, authenticated worker leases and immutable reports.
  Runtime and worker database permissions remain separate. API input whitespace
  is preserved, and the configured source bridge limits text to 3,000 UTF-16 units.
- Quotation fidelity and excerpt extent are presented separately. The inference
  indicator explicitly remains unassessed/pending confirmation. No model or
  AI-ReWrite is connected; Clerk and the existing reviewer flow are preserved.
- A delayed heartbeat now targets only its own review's abort controller; it
  cannot abort the next review after the original lease has finished.

## Fresh verification

Node 24.19.0 and npm 11 were used for checks. Locked dependencies installed with
scripts disabled; subsequent build/test commands used Node 24 explicitly.

Final `npm run check` passed: **248 tests in 17 files**, typecheck, documentation
links, bounded policy checks, formatting and production build. The separate
12-test Python suite passed. `npm audit --audit-level=high` reported zero
vulnerabilities. Vite emitted a non-failing main-chunk size warning (about 630 kB
minified / 172 kB gzip); bundle splitting remains a performance follow-up.

The targeted source/store/worker/theme suite passed 52 checks; the API integration
suite passed 16 checks. The latter covers whitespace/Unicode preservation, length
limits, idempotency, report ownership, schema/revision binding and unavailable
capabilities. A further worker regression verifies late-heartbeat isolation.
The portable Python suite passed 12 offline checks with synthetic SQLite/FTS5 and
stored-context fixtures. These counts overlap the complete suite; do not add them
as independent measurements of accuracy.

Eight actual HTTP workflow checks passed against the current app on a loopback
host: built UI availability; owned sessions/revisions; 2:271 source discovery and
internal-omission warning; 2:256 source discovery; explicitly unassessed inference;
idempotent review identity; stable persisted report reread; and other-guest denial.
Observed total request-to-report times for the two cases were approximately 1.14s
and 0.17s on one warm local run. These are two observations, not latency benchmarks.

The current React UI was exercised with a newly submitted Quran excerpt. It
displayed the submitted text, quoted source, original full ayah, attributable
Muyassar/Saadi stored context and explicit research/semantic limitations. Its
exact-excerpt presentation was corrected after this browser check.

No paid model call, fresh MCP acquisition, hosted database write or deployment was
performed. Previously recorded model experiments are not fresh validation here.

Eleven additional real SQL lifecycle checks passed on the isolated local database:
non-bypass runtime/worker identities and migration availability; atomic report,
evidence and finding persistence; stranger/wrong-secret denial; forged-session RLS
denial; worker direct-table denial; report immutability; cancellation rejecting
late writes; expired-lease reacquisition rejecting the old attempt/token;
replacement-token completion; new-revision invalidation; and expired-guest
invalidation. Synthetic fixtures were isolated from the live application's jobs.

Git checkout line endings initially caused formatter failures on unchanged files.
The new `.gitattributes` pins LF for text to keep formatting, SQL checksums and
packaged Python hashes portable. There are no content changes to earlier migrations.
The isolated fixture was applied before that normalization; its raw SQL checksums
can differ by CRLF/LF, so it is not a target for the production migrator's checksum
replay test. Production migration validation requires a fresh isolated Neon branch.

## Database validation boundary

The local PostgreSQL 18 installation has no pgvector extension. A new, isolated
workflow database used an explicitly adapted **test-only** migration 0001:
the vector extension statement was omitted, the unused embedding column used
`real[]`, and its dimension check used `cardinality`. Its recorded checksum is for
that adapted fixture, not the production migration. Migrations 0002–0006 were
applied unchanged. Runtime and worker logins were non-superuser/non-BYPASSRLS.

Repository SQL migrations were not modified to accommodate this local limitation.
This verifies ordinary relational workflow behavior only. It does **not** validate
pgvector ingestion/search, hosted roles/TLS/pooling, production migration replay,
Neon readiness or accepted corpus storage. Isolated Neon verification under #6
and retrieval evaluation under #7/#8 remain required before enabling hosted use.

## Remaining acceptance

See the [ordered delivery tasks](../architecture/FOUNDATION_INTEGRATION.md).
The Uthmani/imlai comparator and reference-name segmentation can still over-warn;
these are explicit #12 follow-ups. The assessment-scoped provider-failure fix
remains in the foundation and must be ported with deadlines under #17 when models
are connected. There is no new evidence that stronger thinking models improve
semantic judgment. Approved editions, human-adjudicated calibration, hosted
runtime packaging/mounts, full migration verification and owner acceptance remain
open. Disable `FOUNDATION_ENABLED` to return to the unconfigured source-review
state; applied migrations follow the repository's forward-fix policy.
