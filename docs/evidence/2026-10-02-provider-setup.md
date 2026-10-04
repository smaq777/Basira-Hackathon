# Provider setup evidence — 2–3 October 2026

This record distinguishes provider configuration from connection, deployment and product readiness. It contains identifiers and state only; no credential value is recorded. Provider-side GitHub access must be authorized and verified specifically for the current repository before this record is used as current connection evidence.

## GitHub

- Repository: private `smaq777/Basira-Hackathon` under the owner's personal account. The owner cancelled organization transfer.
- Default branch: `development`; production branch: `main`.
- Merge commits enabled; squash, rebase and auto-merge disabled.
- GitHub environment branch policies read back as `development` for `staging` and `main` for `production`.
- Repository deploy variables remain safe-off: `DEPLOY_STAGING_ENABLED=false`, `DEPLOY_PRODUCTION_ENABLED=false`, `DEPLOY_RAILWAY_ENABLED=false`, and `DEPLOY_VERCEL_ENABLED=false`.
- Environment variable `RAILWAY_SERVICE_ID=4d15a8f1-0028-42d6-adfa-cef07e55a9bc` was read back in both GitHub deployment environments.
- No Railway or Vercel deployment token is stored in the GitHub environments.
- Railway and Vercel GitHub App access for `smaq777/Basira-Hackathon` is pending authorization and read-back.

## Railway

- Project `basirah`: `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`.
- Shared `api` service: `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`.
- Production environment: `2427994d-35f6-453d-b9af-d50e337a6b41`.
- Staging environment created and read back: `97179b92-48b1-412f-95ff-1901bb826458`.
- Production remains offline and unexposed. The recorded staging service is available at `https://api-staging-42bc.up.railway.app`; automatic deployment from this repository remains disabled until the provider source connection is reauthorized and verified.
- Successful staging deployment `0daf8a76-a385-4640-ab15-61cf905b70c7` built accepted application revision `428f85960c8097de9bc15e64cbbf371263419fdf` with `npm ci && npm run build`, starts with `npm start`, and uses `/health` for liveness. PR #38 then merged that revision into `development` as merge commit `c534eca1b0aadbc4e94ae3cc5f2636441ab657d5` without squash.
- Restart/redeploy verification `5bdf5061-debd-4a6f-8d21-d7bc485e4aa7` succeeded from the same staged image. After replacement, `/ready` returned migration `0004_runtime_private_schema_usage`, guest-session creation returned `201`, and deletion returned `204`.
- Staging stores `NODE_ENV`, `DORAR_ENABLED`, `GUEST_RETENTION_HOURS`, `TAFSIR_MCP_URL`, `DATABASE_URL`, and `DATABASE_TLS_MODE` in Railway configuration. Secret values were not printed, copied to GitHub or recorded here.
- The first GitHub-source build failed because the custom `npm ci` command attempted to remove Railpack's mounted Vite cache. PR #51 removed that override so Railpack owns dependency installation. The next GitHub deployment `30e5d23f-eaa5-4ca1-8d71-bd330b17aa55` succeeded from merge commit `edbcd6bcca364ea596191a3050f6fe8870d1162a` using Node 24.21.0; the previous active deployment remained available during recovery.
- Automatic deployment `f93f9fb8-9996-436b-86df-d7e6ce5f8c4b` then succeeded from accepted PR #52 merge `82006071a63c269efcd0457db24f3b01d75e4d38` and became the active staging deployment. `/ready` still returned database readiness and migration `0004_runtime_private_schema_usage` after replacement.
- The authenticated Railway CLI was not authorized to create an environment-scoped project token, so no orphan token was created and no broad account credential was copied into GitHub.
- An isolated Railway PostgreSQL staging service (`a971b1ae-6d14-4389-9195-a51b672d3a70`) is connected over Railway's private network with a dedicated least-privilege runtime role. The temporary public database proxy used for migration verification was removed.
- Migrations `0001` through `0004_runtime_private_schema_usage` were applied. Live verification passed migration, RLS, guest isolation, immutable revision and index checks.
- Public smoke checks returned `200` for `/health`, `/ready` and `/api/v1/capabilities`; `201` for session, document and revision creation; and `204` for guest-session deletion. `/api/v1/reviews` correctly returned `501 NOT_IMPLEMENTED`.
- Mobile verification exercised nine public/reviewer routes at 320 px and 390 px (18 combinations) with no horizontal overflow. At 320 px the mobile menu entry was visible inside the viewport and routed to `#/reviewer/dashboard`.
- On 3 October, migration `0005_expired_guest_cleanup` was subsequently applied through the Railway database service's internal connection. `/ready` then reported the exact `0005` version, and a fresh synthetic flow returned `201` for session and document creation, `200` for automatic extraction with two candidates, and `204` for deletion. No connection credential was printed or recorded.

## Neon

- Project `basirah-production` (`weathered-pond-44811639`) and its migrated schema were previously verified in the provider console for this backend branch.
- On 3 October, migration `0005_expired_guest_cleanup` was applied in one protected-branch transaction and read back with its exact checksum. Runtime execution was `true`, `PUBLIC` execution was `false`, the function was `SECURITY DEFINER`, and its configured search path was empty.
- The Railway production environment does not contain a verified Neon runtime connection string.
- A least-privilege production login/connection and deployed `/ready` verification still require completion before production promotion.

## Vercel

- The signed-in account scope `smaq777-hotmailcoms-projects` and Basirah project were read back.
- The Vercel GitHub App must be authorized for `smaq777/Basira-Hackathon`. After authorization, verify `main` as the production source and confirm that pull-request and `development` updates receive checks.
- PR #52 commit `ca3ee202cefaab383dcfe7d83bf0a36dd0a0a1e3` produced a successful Basirah Vercel deployment check at `https://vercel.com/smaq777-hotmailcoms-projects/basirah/9ZBdVGoQasrm47BBSB3QAtd7Cekn`. This is direct Basirah evidence; another repository's bot history is not used.
- The owner explicitly approved public preview access. Vercel Authentication was disabled and read back as off, so preview aliases no longer require Vercel membership. The `basirah-teal.vercel.app` production alias was removed; the Domains page then read back “No domains have been added yet.” `main` remains undeployed.
- Non-secret config `VITE_SESSION_VOICE_ENABLED=true` is scoped only to Preview. It is absent from Production and requires no provider credential.
- PR #54 commit `4e889375030790553c63f3d3fc43edaa78a511d8` produced the public preview `https://basirah-git-saleh-19-vercel-b0d61c-smaq777-hotmailcoms-projects.vercel.app`. An unauthenticated request returned HTTP 200 with no login redirect, and visible browser QA at `/#/result` confirmed the Arabic result comparison, suggested revision and session-grounded voice panel. The deployed bundle contains the Arabic greeting and voice control. Existing responsive QA covers the same application commit; this documentation-only PR does not alter the UI bundle.
- After PR #54 merged, Vercel deployed integration commit `bfc3f1c87ef46a96df4cb7a0cb916b25e4504bc0` as Preview deployment `2naeSVJLHQQiTLUU5KKKKXeDNgPq`. The stable integration handoff URL is `https://basirah-git-development-smaq777-hotmailcoms-projects.vercel.app`; an unauthenticated request returned HTTP 200 and the deployed bundle retained the Arabic voice feature. This is a Preview alias, not production.
- No Vercel API token or provider credential was created or stored in GitHub.

## Required next evidence

1. Configure the least-privilege Neon production runtime connection and verify the deployed `/ready` response without exposing its credential.
2. Document and verify scheduled cleanup plus backup retention for the production database.
3. Controlled Railway rollback rehearsal to the previous compatible deployment, followed by restoration of the accepted revision.
4. Human acceptance before enabling the production gates or deploying `main`.
