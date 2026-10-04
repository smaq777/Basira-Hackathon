# Deployment and service connections

**Current status: a public, database-backed Railway staging prototype is verified at `https://api-staging-42bc.up.railway.app`; Railway and Vercel are linked to the Basirah repository, while production promotion remains gated.**

## Recommended initial topology

Railway runs the Node server and serves built React assets from the same origin. Neon stores the future corpus and session/run data. Optional Vercel previews can show frontend changes, but the checked-in Vercel template currently hosts only the foundation shell; it is not a connected review application.

| Service                  | Current observation                                                                                                                                          | Required next step                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| GitHub                   | `development` default, `main` production, merge commits only; both unprotected                                                                               | Resolve plan/visibility block and read back both branch rules                      |
| Neon                     | Production project exists; latest migrations/runtime access require fresh verification                                                                       | Apply migrations `0002`–`0004`, verify least privilege and connect production only |
| Railway                  | Public staging app plus isolated PostgreSQL are live; `development` source, wait-for-CI and automatic GitHub deployments are verified; production is offline | Rehearse a compatible rollback and keep production disabled                        |
| Vercel                   | Basirah project and GitHub checks are verified; previews are public, the premature production alias is removed and `main` is undeployed                      | Keep the Preview voice flag non-secret and keep production gated                   |
| Model/embedding provider | No verified Basirah credentials or benchmark                                                                                                                 | Choose through evaluation; provision server-side secrets                           |
| Dorar                    | Tested path returned 403                                                                                                                                     | Obtain supported access; keep feature disabled meanwhile                           |

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

The staging environment was duplicated from the safe-off production shell on 2 October 2026. Manual exact-checkout deployment `0daf8a76-a385-4640-ab15-61cf905b70c7` established the first accepted database-backed candidate, and restart/redeploy `5bdf5061-debd-4a6f-8d21-d7bc485e4aa7` retained database readiness. After the Railway GitHub App was limited to Basirah and connected to `development`, the first source build exposed a Railpack cache conflict in the repository's custom `npm ci` override. PR #51 removed the override; automatic deployment `30e5d23f-eaa5-4ca1-8d71-bd330b17aa55` then succeeded from merge commit `edbcd6bcca364ea596191a3050f6fe8870d1162a` using Node 24.21.0. Automatic deployment `f93f9fb8-9996-436b-86df-d7e6ce5f8c4b` subsequently made accepted PR #52 merge `82006071a63c269efcd0457db24f3b01d75e4d38` active without losing database readiness. The public HTTPS origin is `https://api-staging-42bc.up.railway.app`. Production remains offline and unexposed.

The staging database is the isolated Railway PostgreSQL service `a971b1ae-6d14-4389-9195-a51b672d3a70`, reached by the application over Railway's private network. A dedicated runtime role has only the required schema/table/function access. Migrations through `0004_runtime_private_schema_usage` passed the repository verifier. The temporary public TCP proxy used for local migration verification was removed after use.

`DATABASE_TLS_MODE` defaults to `verify-full`. Keep that value for Neon and production. Railway PostgreSQL staging may use `require` because traffic is encrypted with a platform certificate that is not in the public trust store; never copy that exception into the Neon production environment. `disable` exists only for deliberately non-TLS local development and is not an accepted hosted setting.

`railway.json` records the same commands for local and CI review. `.github/workflows/deploy-staging.yml` and `deploy-production.yml` use a scoped `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID` only after their safe-off flags are enabled. GitHub environment variable `RAILWAY_SERVICE_ID` is read back in both `staging` and `production`; the token secret is intentionally absent. An authenticated CLI attempt to create an environment-scoped project token returned `Not Authorized`, so no account-wide token was substituted. A process health check is not content-verification readiness or continuous external uptime monitoring. Do not publish the shell as the finished hackathon product.

Before deployment: confirm Node 24, staged secrets, bounded resources, public URL, logging redaction and rollback target. After deployment: verify the exact build revision, HTTPS, liveness, database readiness, guest intake and source-failure behavior from a clean browser. The staging review endpoint deliberately returns `501`; the visible review journey uses labelled dummy data until the evidence pipeline is implemented.

## Neon implementation gate

Create an isolated non-production environment. Verify pgvector and pg_trgm support, use least-privilege runtime credentials, separate migration privileges where practical, and enforce encrypted connections. Check in reviewed migrations. Verify backup/restore procedures before collecting real user content. Never run a destructive migration automatically during server startup.

## Optional Vercel split frontend

`vercel.json` builds the frontend shell into `apps/web/dist`. The workflows use `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; the preferred Vercel bot path is the verified GitHub integration. A real split deployment needs an implemented `VITE_API_BASE_URL`, allowed origins, secure cookie policy and CSRF assessment. These are not present in the foundation template. Check the selected Vercel plan's collaboration restrictions before inviting a second developer; do not assume account “Pro” on GitHub covers Vercel.

The Vercel GitHub App now has access only to `smaq777/basirah`, and the Basirah Vercel project is connected. The project identifies `main` as its production source. The public integration preview is `https://basirah-git-development-smaq777-hotmailcoms-projects.vercel.app`; Vercel deployment `2naeSVJLHQQiTLUU5KKKKXeDNgPq` serves merge commit `bfc3f1c87ef46a96df4cb7a0cb916b25e4504bc0`. An unauthenticated request returned HTTP 200 without a login redirect, and visible QA confirmed the result and voice surfaces. After explicit owner confirmation, Vercel Authentication was disabled for public preview access and read back as off. The premature `basirah-teal.vercel.app` production alias was removed, and the Domains page read back that no domains are attached. `VITE_SESSION_VOICE_ENABLED=true` is Preview-only public configuration; Production has no value. Copilot review and the Vercel deployment bot are separate checks; neither replaces the owner or scholarly review.

## Release / rollback

Promote only an accepted revision with passing checks and staging evidence. Record database migration version and source/model/corpus versions. For an application regression, return to the last verified compatible build; for schema issues, use the reviewed forward-fix/rollback plan. Do not restore a database or delete user data without explicit owner approval.

Never place service tokens in documentation, GitHub issue bodies or public logs. Configure environment-specific secrets through the hosting platform or GitHub environment controls once access is available. Follow the [credential onboarding guide](CREDENTIALS.md).
