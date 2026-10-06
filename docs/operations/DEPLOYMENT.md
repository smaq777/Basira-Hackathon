# Deployment and service connections

**Current topology, 6 October 2026:** Railway staging serves the real Node API and
built React application from one origin. The report worker uses an isolated report
database and a pinned Neon research corpus. OpenRouter provides primary model
requests; an explicitly enabled direct Gemini backup handles eligible availability
failures. Production promotion remains gated. Use the latest dated
[issue #169 receipt](https://github.com/smaq777/Basira-Hackathon/issues/169) and
[Judge Quickstart evidence](../evidence/2026-10-06-verified-judge-quickstart.md)
for the current deployment and acceptance outcome; this configuration guide is
not an uptime claim.

## Service ownership and readiness

Saleh owns Railway, Neon and Vercel configuration. API credentials stay server-side;
guest users do not need keys or local MCP setup. The application uses a 175-passage
Neon research corpus whose source approvals remain pending. A successful source
request, model response or build does not establish scholarly approval.

| Service                  | Current observation                                                                                                      | Required next step                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| GitHub                   | Public repository; `development` integrates features, `main` is production; merge commits are preserved                  | Verify required CI and owner acceptance; do not infer enforced branch protection from written policy     |
| Neon                     | 175-passage research snapshot and compatible embeddings were read back; report readiness recorded through migration 0018 | Preserve existing databases, TLS, roles and corpus pin; use reviewed migrations only                     |
| Railway                  | Staging serves real owned reviews and reports; provider-side GitHub deployment is separate from the gated workflow       | Align the accepted commit declaration before deployment; record actual deployment identity and readiness |
| Vercel                   | Optional selected staging proxy; the root template remains a frontend shell                                              | Prefer the same-origin Railway demo; verify any selected preview independently                           |
| Model/embedding provider | Selected real OpenRouter, direct Gemini backup and embedding requests have dated receipts                                | Retain first outcomes and server-only credentials; run fresh acceptance for each release                 |
| Dorar                    | The earlier tested path returned 403; live availability and broad hadith coverage are not established                    | Keep unavailable access disclosed; do not substitute unrelated evidence                                  |

No credentials were copied from unrelated projects. Do not interpret another project's Vercel comments as proof of Basirah integration. The repository remains in the owner's personal GitHub account; the owner cancelled the earlier organization-transfer direction.

## Branch and environment route

| Git ref                               | GitHub environment | Provider target                                           | Trigger and gate                                                                                      |
| ------------------------------------- | ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `<actor>/<issue>-<slug>` pull request | none               | Optional Vercel PR preview after verified Git integration | CI and owner acceptance; never production                                                             |
| `development`                         | `staging`          | Railway staging and optional Vercel preview               | Push or manual run; `DEPLOY_STAGING_ENABLED=true`                                                     |
| `main`                                | `production`       | Railway production and optional Vercel production         | Manual workflow only; main ref, typed `DEPLOY`, owner acceptance and `DEPLOY_PRODUCTION_ENABLED=true` |

The GitHub `staging` environment accepts only `development`; `production` accepts
only `main`. Provider flags are independent. The GitHub staging workflow is gated
by repository variables and does not manage Railway's separate GitHub auto-deploy
setting or update `BASIRAH_DEPLOYMENT_SHA`. Turning the workflow off does not stop
provider-side auto-deploy. Read back both settings when coordinating a release.

## Exact staging release procedure

1. Freeze additional `development` merges during acceptance. Saleh can temporarily
   disable Railway auto-deploy to control the accepted source; leave production off.
2. Choose the accepted 40-character `development` commit with passing required CI.
   Set `BASIRAH_DEPLOYMENT_SHA` to that exact commit without triggering an intervening
   deployment. Preserve the staging environment/ref/service declarations, report
   ownership, TLS, Neon corpus pin and existing provider keys/backup flag.
3. Deploy that same source. Read the actual source SHA and deployment ID from Railway
   and compare them with the declaration. If startup reports
   `HOSTED_DEMO_ENVIRONMENT_MISMATCH`, inspect the differing declaration/metadata;
   do not disable the guard or assume every startup failure has this cause.
4. Require HTTP 200 from `/health`, `/ready` and `/api/v1/capabilities`. Readiness
   verifies service dependencies; `verification:false` discloses the provisional
   content boundary. It is not proof that semantic assessment or rewrite passed.
5. Run one fresh six-case acceptance using
   [the runner](../../scripts/acceptance-submission-staging.mjs) and its current
   corpus/prompt expectations. Retain the first outcomes, exact report/citation
   bindings, saved-report reload equality and anonymous denial. Do not retry failed
   cases into a passing receipt.
6. Verify a useful supported-author rewrite, unchanged quotation/conditions,
   exact server/display/clipboard equality, cancellation and original report reload.
   Record limitations before demonstrating to judges. Acceptance and issue closure
   remain owner decisions.

The 6 October [owner coordination receipt](https://github.com/smaq777/Basira-Hackathon/issues/169#issuecomment-6019990920)
confirmed the automatic deployment of accepted PR186 merge `f29b3145c0b5a0b6af888fe79c060f91b1fcdfdb`
crashed with `HOSTED_DEMO_ENVIRONMENT_MISMATCH` while the declared SHA remained old.
The preceding working release was replaced. This is an operational coordination
failure regardless of who merged the PR. The receipt's recovery plan is not proof
of the subsequent deployment identity or full acceptance.

## Railway template and historical bootstrap

The verified Railway project is `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`. It contains the shared `api` service `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`, production environment `2427994d-35f6-453d-b9af-d50e337a6b41`, and staging environment `97179b92-48b1-412f-95ff-1901bb826458`. These identifiers are routing metadata, not credentials.

The following identifiers are historical application deployment validation, not
the current source or acceptance receipt. The staging environment was duplicated
from the safe-off production shell on 2 October 2026. Manual exact-checkout
deployment `0daf8a76-a385-4640-ab15-61cf905b70c7` established the first accepted
database-backed candidate. A later Railpack cache conflict in the custom `npm ci`
override was resolved by removing that override. The public HTTPS origin is
`https://api-staging-42bc.up.railway.app`. Verify the current Railway GitHub source
and recorded release separately; production remains gated.

The isolated Railway report PostgreSQL service `a971b1ae-6d14-4389-9195-a51b672d3a70`
is reached over Railway's private network with distinct runtime/worker roles.
The older bootstrap verified migrations through 0004; later dated readiness
receipts record 0018. Do not reapply old migration instructions as if they were the
current chain. Neon research retrieval remains separate from this report database.

`DATABASE_TLS_MODE` defaults to `verify-full`. Keep that value for Neon and production. When a provider uses a private or self-signed PostgreSQL certificate chain, store its PEM root or CA chain in the server-only `DATABASE_CA_CERT`; the runtime, migration and verification clients use it without weakening hostname/certificate verification. Railway PostgreSQL staging may use `require` only in an explicitly accepted non-production profile while its provider CA is unavailable. `disable` exists only for deliberately non-TLS local development and is not an accepted hosted setting.

`railway.json` records the build/start commands for local and CI review.
`.github/workflows/deploy-staging.yml` and `deploy-production.yml` require a scoped
`RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID` after their flags are enabled. An earlier
bootstrap could not create an environment-scoped token and kept that workflow
path disabled. Read back the current configuration with Saleh rather than
substituting an account-wide token. A process health check is not content
acceptance or continuous external uptime monitoring.

Before deployment, confirm Node 24, server secrets, bounded resources, logging
redaction and a compatible rollback target. The connected staging review journey
creates owned immutable revisions and asynchronous review runs, then renders
durable real reports. The earlier shell's deliberate `501` and dummy-results
description is historical. A default-off or unavailable profile must still disclose
its actual capabilities instead of presenting dummy output as a real result.

## Neon implementation gate

Create an isolated non-production environment. Verify pgvector and pg_trgm support, use least-privilege runtime credentials, separate migration privileges where practical, and enforce encrypted connections. Check in reviewed migrations. Verify backup/restore procedures before collecting real user content. Never run a destructive migration automatically during server startup.

## Optional Vercel split frontend

Issue #69 adds a separately selected staging configuration with a fixed
same-origin API proxy. See the [staging connection runbook](STAGING_CONNECTION.md)
and [read-only diagnostic](../evidence/2026-10-05-staging-api-routing.md).
`vercel.staging.json` is selected explicitly by the gated staging workflow or
Preview CLI commands; root `vercel.json` and production remain a static shell.
The proxy repairs API routing, not foundation-worker readiness or semantic
acceptance. Direct cross-origin frontend/API hosting still
requires the additional controls described below.

`vercel.json` builds the frontend shell into `apps/web/dist`. The workflows use `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; the preferred Vercel bot path is the verified GitHub integration. A real split deployment needs an implemented `VITE_API_BASE_URL`, allowed origins, secure cookie policy and CSRF assessment. These are not present in the foundation template. Check the selected Vercel plan's collaboration restrictions before inviting a second developer; do not assume account “Pro” on GitHub covers Vercel.

The repository contains Vercel configuration and workflow integration points.
Verify the selected deployment and its source before relying on a preview; neither
a bot comment nor a frontend build establishes API connectivity. Keep `main` as
the production source and `development` or pull requests as preview sources.
`VITE_SESSION_VOICE_ENABLED=true` is Preview-only public configuration; Production
should have no value. Bot checks do not replace owner or scholarly acceptance.

## Release / rollback

Promote only an accepted revision with passing checks and staging evidence. Record database migration version and source/model/corpus versions. For an application regression, return to the last verified compatible build; for schema issues, use the reviewed forward-fix/rollback plan. Do not restore a database or delete user data without explicit owner approval.

Never place service tokens in documentation, GitHub issue bodies or public logs. Configure environment-specific secrets through the hosting platform or GitHub environment controls once access is available. Follow the [credential onboarding guide](CREDENTIALS.md).
