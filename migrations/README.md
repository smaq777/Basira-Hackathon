# Database migrations

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
