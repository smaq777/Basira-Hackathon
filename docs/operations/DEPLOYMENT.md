# Deployment and service connections

**Current status: Railway staging is linked to `development` with wait-for-CI and automatic deployment, and Vercel pull-request previews are verified. Production promotion remains gated.**

## Recommended initial topology

Railway runs the Node server and serves built React assets from the same origin. PostgreSQL stores guest sessions, revisions and review-run state; the approved corpus and evidence pipeline remain pending. Vercel previews show the frontend build, while Railway remains the supported same-origin functional staging path.

| Service                  | Current observation                                                                                                                                          | Required next step                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| GitHub                   | `development` default, `main` production, merge commits only; both unprotected                                                                               | Resolve plan/visibility block and read back both branch rules             |
| Neon                     | Production schema and migration `0005_expired_guest_cleanup` are verified; runtime access remains separate                                                   | Verify the least-privilege production runtime connection before promotion |
| Railway                  | Public staging app plus isolated PostgreSQL are live; `development` source, wait-for-CI and automatic GitHub deployments are verified; production is offline | Rehearse a compatible rollback and keep production disabled               |
| Vercel                   | Basirah project and GitHub checks are verified; previews are public, the premature production alias is removed and `main` is undeployed                      | Keep the Preview voice flag non-secret and keep production gated          |
| Model/embedding provider | No verified Basirah credentials or benchmark                                                                                                                 | Choose through evaluation; provision server-side secrets                  |
| Dorar                    | Tested path returned 403                                                                                                                                     | Obtain supported access; keep feature disabled meanwhile                  |

No credentials were copied from unrelated projects. Do not interpret another project's Vercel comments as proof of Basirah integration. The repository remains in the owner's personal GitHub account; the owner cancelled the earlier organization-transfer direction.

## Branch and environment route

| Git ref                               | GitHub environment | Provider target                                           | Trigger and gate                                                                                      |
| ------------------------------------- | ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `<actor>/<issue>-<slug>` pull request | none               | Optional Vercel PR preview after verified Git integration | CI and owner acceptance; never production                                                             |
| `development`                         | `staging`          | Railway staging and optional Vercel preview               | Push or manual run; `DEPLOY_STAGING_ENABLED=true`                                                     |
| `main`                                | `production`       | Railway production and optional Vercel production         | Manual workflow only; main ref, typed `DEPLOY`, owner acceptance and `DEPLOY_PRODUCTION_ENABLED=true` |

The GitHub `staging` environment accepts only `development`; `production` accepts only `main`. Provider flags are independent so Railway or Vercel can remain disabled while the other is evaluated. All four repository flags currently equal `false`.

## Railway template

The verified Railway project is `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`. It contains the shared `api` service `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`, production environment `2427994d-35f6-453d-b9af-d50e337a6b41`, and staging environment `97179b92-48b1-412f-95ff-1901bb826458`. These identifiers are routing metadata, not credentials.

Railway staging is connected to `development`; wait-for-CI and automatic deployment are active. The current public HTTPS origin is `https://api-staging-42bc.up.railway.app`. Live read-back returns `200` for `/health` and `/ready`, with migration `0005_expired_guest_cleanup`. Production remains offline and unexposed.

The staging database is the isolated Railway PostgreSQL service `a971b1ae-6d14-4389-9195-a51b672d3a70`, reached by the application over Railway's private network. A dedicated runtime role has only the required schema/table/function access. Migrations through `0005_expired_guest_cleanup` passed live readiness and repository verification. The temporary public TCP proxy used for migration verification was removed after use.

`DATABASE_TLS_MODE` defaults to `verify-full`. Keep that value for Neon and production. Railway PostgreSQL staging may use `require` because traffic is encrypted with a platform certificate that is not in the public trust store; never copy that exception into the Neon production environment. `disable` exists only for deliberately non-TLS local development and is not an accepted hosted setting.

`railway.json` records the same commands for local and CI review. `.github/workflows/deploy-staging.yml` and `deploy-production.yml` use a scoped `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID` only after their safe-off flags are enabled. GitHub environment variable `RAILWAY_SERVICE_ID` is read back in both `staging` and `production`; the token secret is intentionally absent. An authenticated CLI attempt to create an environment-scoped project token returned `Not Authorized`, so no account-wide token was substituted. A process health check is not content-verification readiness or continuous external uptime monitoring. Do not publish the shell as the finished hackathon product.

Before deployment: confirm Node 24, staged secrets, bounded resources, public URL, logging redaction and rollback target. After deployment: verify the exact build revision, HTTPS, liveness, database readiness, guest intake and source-failure behavior from a clean browser. Review-run creation and lifecycle persistence are implemented, but the live evidence-verification worker is not connected; visible review results remain labelled illustrative.

## Neon implementation gate

Create an isolated non-production environment. Verify pgvector and pg_trgm support, use least-privilege runtime credentials, separate migration privileges where practical, and enforce encrypted connections. Check in reviewed migrations. Verify backup/restore procedures before collecting real user content. Never run a destructive migration automatically during server startup.

## Optional Vercel split frontend

`vercel.json` builds the frontend into `apps/web/dist`. The workflows use `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; the preferred Vercel bot path is the verified GitHub integration. A functional split deployment still needs an implemented `VITE_API_BASE_URL`, allowed origins, secure cookie policy and CSRF assessment. Check the selected Vercel plan's collaboration restrictions before inviting a second developer; do not assume account “Pro” on GitHub covers Vercel.

Provider-side GitHub access is verified by current Vercel pull-request checks and public previews. The production source/alias still requires final read-back under Issue #61 before it is presented to the committee. `VITE_SESSION_VOICE_ENABLED=true` is intended for Preview-only public configuration; Production should have no value. Copilot review and the Vercel deployment bot are separate checks; neither replaces the owner or scholarly review.

## Release / rollback

Promote only an accepted revision with passing checks and staging evidence. Record database migration version and source/model/corpus versions. For an application regression, return to the last verified compatible build; for schema issues, use the reviewed forward-fix/rollback plan. Do not restore a database or delete user data without explicit owner approval.

Never place service tokens in documentation, GitHub issue bodies or public logs. Configure environment-specific secrets through the hosting platform or GitHub environment controls once access is available. Follow the [credential onboarding guide](CREDENTIALS.md).
