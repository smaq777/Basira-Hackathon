# Backend API and secret handoff

Basirah uses one Railway project and one shared service definition with isolated `staging` and `production` environments, plus one dedicated Neon production database for the two-day experiment. Staging is an offline validation environment until a reviewed source is connected; it is not a second always-on production backend.

## Implemented HTTP surface

| Route                                             | State       | Purpose                                                                       |
| ------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `GET /health`                                     | Implemented | Process liveness only                                                         |
| `GET /ready`                                      | Implemented | Runtime database and migration readiness                                      |
| `GET /api/v1/capabilities`                        | Implemented | Honest feature availability                                                   |
| `GET /api/v1/reviewer/session`                    | Implemented | Verify a Clerk session and the separate reviewer user-ID allowlist            |
| `POST /api/v1/sessions`                           | Implemented | Create an expiring guest session in an HttpOnly cookie                        |
| `DELETE /api/v1/session`                          | Implemented | Idempotently delete guest-owned content                                       |
| `POST /api/v1/documents`                          | Implemented | Create an owned document and immutable first revision                         |
| `POST /api/v1/documents/{documentId}/revisions`   | Implemented | Create an immutable child revision                                            |
| `POST /api/v1/revisions/{revisionId}/extractions` | Implemented | Automatically extract bounded candidates; never returns verification findings |
| `POST /api/v1/reviews`                            | Implemented | Create or replay an idempotent review run bound to one revision               |
| `GET /api/v1/reviews/{reviewId}`                  | Implemented | Read owned run state and reconcile expired active runs                        |
| `DELETE /api/v1/reviews/{reviewId}`               | Implemented | Idempotently cancel an owned non-terminal run                                 |

The complete machine-readable contract is in [`OPENAPI.yaml`](../api/OPENAPI.yaml). The website should call the same origin with credentials included so the HttpOnly, `SameSite=Strict` guest cookie remains server-managed. No provider secret belongs in a `VITE_*` variable.

Reviewer access uses Clerk in two layers: `VITE_CLERK_PUBLISHABLE_KEY` initializes the public
browser SDK, while the API uses `CLERK_SECRET_KEY` to verify the bearer session. Authorization
defaults to `CLERK_REVIEWER_ACCESS_MODE=allowlist`, where the API checks
`CLERK_REVIEWER_USER_IDS` and a valid but unlisted account receives `403`. A time-bounded hackathon
staging environment may explicitly select `authenticated`, which admits every verified Clerk
session while still rejecting anonymous requests. Production must remain on `allowlist` until
roles and permissions replace this temporary policy. `CLERK_AUTHORIZED_PARTIES` contains exact permitted application
origins to protect against subdomain cookie leakage. If any required server value is absent, the
reviewer route fails closed while guest intake remains independent. The Clerk frontend API origin
is validated as an exact HTTPS origin in production, and it must be configured exactly when the
reviewer authentication gateway is enabled.

Public session creation is limited to 12 requests per 10 minutes per client address, and guest
mutations are limited to 60 requests per minute per guest session. Database caps additionally
limit each guest to 20 documents, each document to 20 revisions and each revision to 10 review
runs. The API returns `429 RATE_LIMITED` for burst limits and `429 RESOURCE_LIMIT_REACHED` for a
database cap. These in-process limits are defense in depth; Railway or another trusted edge must
enforce distributed production limits. The production proxy setting assumes exactly one trusted
Railway reverse proxy.

## Railway production variables

| Variable                     | Secret    | Initial production value or owner action                            |
| ---------------------------- | --------- | ------------------------------------------------------------------- |
| `NODE_ENV`                   | No        | `production`                                                        |
| `GUEST_RETENTION_HOURS`      | No        | `24`                                                                |
| `DATABASE_URL`               | Yes       | Pooled TLS URL for the least-privilege `basirah_app` role           |
| `TAFSIR_MCP_URL`             | No        | `https://mcp.tafsir.net/mcp`                                        |
| `DORAR_ENABLED`              | No        | `false` until authorized access passes its integration gate         |
| `COHERE_API_KEY`             | Yes       | Leave unset until the embedding benchmark selects Cohere            |
| `LLM_API_KEY`                | Yes       | Leave unset until the Arabic benchmark selects a reasoning provider |
| `LLM_MODEL`                  | No        | Leave unset until provider/model selection                          |
| `EMBEDDING_MODEL`            | No        | Candidate `embed-v4.0`; not an accepted winner                      |
| `EMBEDDING_DIMENSION`        | No        | Candidate `1024`; must match the selected model and stored vectors  |
| `VITE_CLERK_PUBLISHABLE_KEY` | No        | Clerk browser identifier; intentionally public                      |
| `CLERK_PUBLISHABLE_KEY`      | No        | Clerk server identifier                                             |
| `CLERK_SECRET_KEY`           | Yes       | Clerk server verification key                                       |
| `CLERK_AUTHORIZED_PARTIES`   | No        | Exact comma-separated application origins                           |
| `CLERK_REVIEWER_ACCESS_MODE` | No        | `allowlist`; use `authenticated` only for hackathon staging         |
| `CLERK_REVIEWER_USER_IDS`    | Sensitive | Comma-separated approved Clerk reviewer IDs                         |
| `CLERK_FRONTEND_API_ORIGIN`  | No        | Exact Clerk Frontend API origin for the response CSP                |

Provider keys are generated by the owner in the selected provider console and entered only in Railway's secret-variable UI. Teammates receive Railway project access through the workspace invitation flow; keys are never sent in chat, committed, placed in GitHub issues or exposed through the frontend.

## Verified hosting identifiers

| Resource                 | Verified identifier                    | Current state                                               |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------- |
| Railway project          | `9837ef84-08f3-4228-b7ac-f3b3dc25fba0` | Exists                                                      |
| Railway API service      | `4d15a8f1-0028-42d6-adfa-cef07e55a9bc` | Shared service definition                                   |
| Railway staging          | `97179b92-48b1-412f-95ff-1901bb826458` | Public staging API and web prototype; schema through `0005` |
| Railway production       | `2427994d-35f6-453d-b9af-d50e337a6b41` | Exists; offline and unexposed                               |
| Neon project             | `weathered-pond-44811639`              | Schema verified through `0005`; runtime connection pending  |
| GitHub staging policy    | `development` branch                   | Read back                                                   |
| GitHub production policy | `main` branch                          | Read back                                                   |

Provider IDs are non-secret routing metadata. Passwords, tokens and connection strings are deliberately omitted.

## Deployment gate

Deploy only an accepted commit from `main`. Record the Git SHA, migration version and Railway deployment identifier. `/health` may pass while evidence review is still unavailable; `/ready` proves only that the runtime database and required migration are reachable. Product readiness additionally requires the approved corpus, retrieval/provider integrations, end-to-end review flow and evaluation evidence.

Migration `0005_expired_guest_cleanup` is verified on both Neon production and the isolated Railway
staging database. Railway `/ready` reports the exact version and a fresh synthetic guest flow passed
session creation, document creation, automatic extraction and deletion after the migration. The
opportunistic cleanup is therefore active on staging. Production still requires a verified scheduled
cleanup for periods with no new guest traffic and a documented backup policy.
