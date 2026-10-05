# Security and mobile verification evidence — 3 October 2026

This record separates verified software and staging behavior from planned scholarly verification.
No private user text, credentials, cookies or internal conversation notes are included.

## Accepted repository change

- The security and mobile changes are included in the repository baseline, with a merge
  commit after all quality, policy, dependency-audit and Vercel checks passed.
- The change added in-process burst limits, database-backed guest resource caps, forward migration
  `0005_expired_guest_cleanup`, accurate retention wording and documented residual controls.
- Local validation passed 110 tests, documentation and policy checks, formatting, the production
  build and a production-dependency audit with zero reported vulnerabilities.
- The private security workbench scan reported one medium aggregate-abuse risk and one low expired-
  data cleanup risk before the fix. The detailed report remains local and is not published in the
  repository. Distributed edge throttling, a scheduled idle-period purge and provider backup
  retention remain production requirements.

## Public Railway staging verification

Verified URL: `https://api-staging-42bc.up.railway.app`

- `/health` returned `200` with the backend stage.
- `/ready` returned `200`, database readiness and migration `0004_runtime_private_schema_usage`.
- `/api/v1/capabilities` reported guest documents and review orchestration as available while
  truthfully reporting `verification: false` and no live providers.
- A clean synthetic guest flow returned `201` for session and document creation, `200` for
  automatic extraction, two extracted candidates, and `204` for explicit guest deletion.
- The deployed web bundle contains the current Arabic disclosure that guest access expires after
  24 hours. It does not claim exact deletion timing.

Migration `0005` was merged but had not yet been applied to the isolated Railway staging database
during this initial walkthrough. The API correctly skipped its cleanup call while staging reported
an older migration. The subsequent migration and repeat smoke test are recorded below.

## Subsequent Railway staging migration

After the initial mobile walkthrough, migration `0005_expired_guest_cleanup` was applied to the
isolated Railway staging PostgreSQL service through its internal database connection. The checked-in
migration ran as one transaction with stop-on-error enabled; the console reported `BEGIN`, function
creation, privilege changes, one migration-ledger insert and `COMMIT`. No database credential was
printed, copied into GitHub or recorded in this evidence.

A public read-back then returned `200` from `/ready` with database status `ready`, migration version
`0005_expired_guest_cleanup` and `verification: false`. A new synthetic same-origin flow returned
`201` for guest-session creation, `201` for document creation, `200` for automatic extraction with
two candidates, and `204` for explicit guest deletion. This verifies the staging schema transition
and API compatibility; it does not claim a live verification engine or production readiness.

## Neon production migration

After explicit owner confirmation, migration `0005_expired_guest_cleanup` was applied in the Neon
protected SQL editor. The seven-statement transaction completed successfully. A separate read-only
query returned one row and verified:

- version `0005_expired_guest_cleanup` and checksum
  `ac635cf8eac20eca34fef77e5f107fafca335fd37670ee8fc53623405b445c95`;
- `basirah_runtime` can execute the bounded cleanup function;
- `PUBLIC` cannot execute it;
- the function is `SECURITY DEFINER`; and
- its configured search path is empty.

This verifies the migration and function boundary, not the separate Railway production runtime
connection, scheduled cleanup, backup retention or product readiness.

## Mobile browser walkthrough

The public Railway site was tested with a 390 × 844 browser viewport override, yielding a 325 CSS-
pixel content viewport after browser chrome. The viewport override was reset after testing.

- Home: Arabic RTL composition, Cairo font, labelled textarea, empty/default state, sample loading,
  mobile menu and retention disclosure rendered without horizontal overflow.
- Automatic analysis: no claim-type dropdown was present. The agent-style progress screen explained
  that extraction and analysis run in the background.
- Result: the saved draft reported two automatically extracted candidates, then displayed separate
  support-sufficiency and literal-transfer cards, source context and the full copyable suggested
  revision beneath them.
- Reviewer workspace: mobile navigation opened the dashboard, queue and `BR-1042` detail. Dummy data
  remained visibly labelled and the reviewer decision controls were exposed to accessibility APIs.
- Browser checks found meaningful content, `dir="rtl"`, computed `Cairo, Tahoma, Arial, sans-serif`,
  equal page/client widths, no framework error overlay, and no console errors or warnings.

The first automatic-analysis attempt displayed the recoverable Arabic connection state; the visible
**Retry** action completed the same saved request and reached the result. This proves recovery UX,
not provider reliability. It remains evidence for Issue #17 latency/retry work.

## Boundaries

- The report content remains an explicitly labelled illustrative demo, not a live scholarly verdict.
- The Vercel integration preview is public, but split-origin cookie persistence is not the supported
  staging data path; the Railway same-origin URL is the handoff URL for functional testing.
- No production release, source-corpus approval, human content acceptance or scientific accuracy
  score is claimed by this evidence.
