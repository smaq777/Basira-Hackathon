# Database migrations

Migration `0015` adds separate insert-only source-content views and contiguous body
windows after the owner's secure tickets `0013` and direct ticket intake `0014`.
Original/v1 records remain unchanged; there are no new vectors or roles. The
content-view flag defaults off. See [cleaning evidence](../docs/evidence/2026-10-05-source-content-views.md).

Migration `0014` lets an owned current revision enter the same secure human-review
queue when automated analysis is unavailable. It keeps report-backed tickets
compatible, exposes the original submission to authorized reviewers, and does
not weaken the ticket-code plus email lookup requirement.

Migration `0011` adds insert-only retained-page metadata and pinned vectors with
exact UTF16/codepoint parent bindings. It requires `0010` and isolated fresh/copy
validation. Forward `0012` fixes empty-prefix UTF16 length discovered by a valid
Unicode insertion probe; apply both before enabling. The application flag defaults off. See the
[passage-index evidence](../docs/evidence/2026-10-05-cache-passage-index.md).

Basirah uses reviewed, forward-only SQL migrations. Production migrations are explicit operator actions; the application never runs them at startup.

## Connections and roles

- `DATABASE_URL_UNPOOLED` is the direct Neon owner connection used only by `npm run db:migrate`. Do not configure it on Railway.
- `DATABASE_URL` is the pooled TLS connection for a dedicated login role that inherits `basirah_runtime`. It is used by the API and `npm run db:verify`.
- `basirah_runtime` is a non-login, non-superuser, non-`BYPASSRLS` group role. The migration grants only the table, sequence and function access required by the backend.

The runtime login and its random password are created outside source control after the migration. Grant only `basirah_runtime`, set bounded statement and idle transaction timeouts, and store the resulting pooled URL in the hosting platform's secret store. Never use `neondb_owner` as the application runtime role.

## Apply and verify

```bash
DATABASE_URL_UNPOOLED='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' npm run db:verify
```

The migration runner records a SHA-256 checksum and refuses to accept a changed migration that is already applied. The verification script uses synthetic data inside a rolled-back serializable transaction to check schema version, RLS coverage, absence of `PUBLIC` table grants, required indexes, cross-session isolation, signed-session anti-forgery and immutable revisions.

New migrations execute and record their checksum with canonical LF line endings.
Existing recorded checksums are accepted only when they match the same exact SQL
in deterministic LF or CRLF form, supporting Windows checkout conversion without
rewriting historical SQL or database metadata. SQL edits, whitespace changes,
mixed-ending historical hashes and local extension substitutions remain rejected.

Migration `0005` grants the runtime role one bounded cleanup function, not direct delete access.
The API calls it opportunistically in batches of 100 after confirming that `0005` is active. This
keeps normal traffic from accumulating expired primary rows, but a production scheduler is still
required to guarantee cleanup during idle periods. Provider backups need their own verified
retention and deletion policy.

## Forward-fix policy

Migration `0006` adds immutable source reports and bounded worker leases. Configure
`REVIEW_WORKER_DATABASE_URL` with a separate login inheriting `basirah_worker`;
keep report reads on the ordinary `basirah_runtime` connection. The worker role
receives only scoped function execution, not table ownership. Review the
[integration guide](../docs/architecture/FOUNDATION_INTEGRATION.md) before enabling.
Local workflow tests on PostgreSQL without pgvector are not full migration validation;
fresh and production-shaped isolated Neon validation remains required under #6.

Do not edit an applied migration. Add a numbered migration, test it against a fresh database and a production-shaped copy, and prefer expand-and-contract changes. Do not put destructive migrations in application startup. Production data deletion, restore, reset or project removal requires separate owner approval.

Migration `0007` preserves up to 80 quotation findings per report. The former five-item bound belonged to claim proposals and truncated longer quotation reviews. Apply this forward migration before enabling the source worker. Existing immutable reports remain unchanged; reanalysis produces a new complete report. Roll back the application flag rather than rewriting applied migration history.

Migration `0008` adds explicit scholarly-book/explanation source roles, immutable
passage metadata and typed cross-work links, and extends report persistence for
the truthful new roles. Its separate `basirah_research_runtime` role admits
pending sources only for explicit development research. Never grant it to the
production login. Migration `0009` records versioned corpus membership separately
from immutable source originals, allowing the same snapshot and compatible
embedding configuration to be reused in another corpus version. Hosted claim
retrieval requires both forward migrations. See the [persistent corpus evidence](../docs/evidence/2026-10-05-hosted-source-corpus.md).

The cleaning experiment at `0c04dcf` applied an experimental
`0013_source_content_views` on a separate child and retained a functional `42702`
failure. That child and checksum stay unchanged. Current development owns
`0013_secure_review_tickets`; cleaning uses deployment `0015_source_content_views`
with the corrected range alias and requires fresh isolated validation.

Corrected cleaning `0014` was applied only to the frozen isolated child before the
owner added direct ticket migration `0014`. Its applied checksum and receipts stay
unchanged. Current deployment assigns that same cleaning DDL to `0015`; a database
with experimental cleaning `0014` must not be blindly replayed as deployment history.
