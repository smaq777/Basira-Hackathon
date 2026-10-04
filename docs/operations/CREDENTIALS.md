# Credentials and service onboarding

This is the judge and maintainer guide for obtaining configuration safely. It lists names and official setup locations only. Never paste a real value into this repository, a pull request, an issue, a screenshot, a log, or a committee document.

## What the current repository needs

The repository builds and runs its deterministic checks **without any external credential**. `PORT` and `NODE_ENV` are ordinary configuration. The hosted staging runtime already has its database credential in Railway's secret store; judges do not need it to open the public demo or run the credential-free test suite.

Judges should first run the credential-free path in the root [README](../../README.md). If a final tagged release uses a provider, the release notes must name the provider/model and mark the matching row below as required. An unset planned variable is not a setup failure for the current prototype.

## Runtime configuration

| Service                          | Purpose and current status                                                                                | Official setup location                                                                                                                                                                                                           | Variable                                                                                                         | Safe location                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Neon                             | Production schema and migration `0005` are verified; the production runtime connection remains gated      | [Neon console](https://console.neon.tech/) and the project **Connect** dialog                                                                                                                                                     | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                                                                          | Railway environment variables or local ignored `.env`; never Vercel client variables                                 |
| Railway PostgreSQL staging       | Implemented with a dedicated least-privilege runtime role; value remains provider-side                    | Existing Basirah Railway project                                                                                                                                                                                                  | `DATABASE_URL`                                                                                                   | Railway staging environment only                                                                                     |
| Database TLS policy              | Strict verification is the default                                                                        | Hosting provider's PostgreSQL TLS documentation                                                                                                                                                                                   | `DATABASE_TLS_MODE`                                                                                              | `verify-full` for Neon/production; `require` only for an encrypted provider certificate that is not publicly trusted |
| Cohere                           | Candidate embeddings; selection still requires evaluation                                                 | [Cohere dashboard API keys](https://dashboard.cohere.com/api-keys)                                                                                                                                                                | `COHERE_API_KEY`                                                                                                 | Railway environment variable or GitHub environment secret                                                            |
| Selected language-model provider | Planned structured extraction/support assessment; provider is not yet selected                            | Use only the official key page for the provider named in the accepted release. Do not guess from `LLM_API_KEY`.                                                                                                                   | `LLM_API_KEY`, `LLM_MODEL`                                                                                       | Railway environment variable or GitHub environment secret                                                            |
| Tafsir MCP                       | Planned approved-source adapter; public remote MCP endpoint, not a repository secret                      | [Tafsir MCP project](https://github.com/tafsircenter/tafsir-mcp)                                                                                                                                                                  | `TAFSIR_MCP_URL`                                                                                                 | Ordinary server configuration; the default URL is public                                                             |
| Dorar                            | Disabled because sampled access returned 403; no supported production credential is claimed               | [Dorar](https://dorar.net/)                                                                                                                                                                                                       | `DORAR_ENABLED=false`                                                                                            | Leave off until access, terms, and tests are verified                                                                |
| Guest retention                  | Planned server policy, not a secret                                                                       | Project-approved privacy policy                                                                                                                                                                                                   | `GUEST_RETENTION_HOURS`                                                                                          | Railway environment variable                                                                                         |
| Review lifecycle                 | Implemented deadline and reproducibility metadata; neither value is secret                                | Project configuration                                                                                                                                                                                                             | `REVIEW_DEADLINE_SECONDS`, `CORPUS_VERSION`                                                                      | Railway environment variable                                                                                         |
| Public API origin                | Needed only if Vercel hosts a split frontend                                                              | Accepted Railway HTTPS origin                                                                                                                                                                                                     | `VITE_API_BASE_URL`                                                                                              | Vercel environment variable; it is browser-visible and must never contain credentials                                |
| Session voice evaluation         | Optional browser-native proof of value; disabled by default and uses no provider credential               | Existing Basirah result-page evaluation                                                                                                                                                                                           | `VITE_SESSION_VOICE_ENABLED`                                                                                     | Vercel Preview or local public configuration only; value is `true` or `false`                                        |
| Clerk reviewer authentication    | Implemented as a default-deny reviewer gate; hosted verification still requires environment configuration | [Clerk API keys](https://dashboard.clerk.com/last-active?path=api-keys), [React setup](https://clerk.com/docs/react/getting-started/quickstart), and [Express setup](https://clerk.com/docs/expressjs/getting-started/quickstart) | `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`                                        | Public key in the Railway build environment; secret key only in the Railway server environment                       |
| Clerk reviewer authorization     | Server policy checked after token verification; allowlist is the production default                       | Basirah Clerk **Users** page                                                                                                                                                                                                      | `CLERK_REVIEWER_ACCESS_MODE`, `CLERK_REVIEWER_USER_IDS`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_FRONTEND_API_ORIGIN` | Railway staging/production variables; never source, issue text or client storage                                     |

Connection strings contain credentials even when their names do not include `KEY` or `TOKEN`. Rotate a leaked string before cleaning history.

`VITE_CLERK_PUBLISHABLE_KEY` is designed to be public; `CLERK_SECRET_KEY` is not. Configure exact
authorized parties such as `https://api-staging-42bc.up.railway.app`, not wildcard origins. Add a
Clerk user ID to `CLERK_REVIEWER_USER_IDS` only after that user has authenticated and the owner has
approved reviewer access. A Clerk dashboard/team account is not automatically a Basirah reviewer.
For the hackathon demo only, staging may set `CLERK_REVIEWER_ACCESS_MODE=authenticated` so judges
and committee members can enter after sign-in without a manual allowlist step. Do not copy that
setting to production; remove it or set `allowlist` when the open evaluation window ends.

## Deployment credentials

### Railway backend

1. Open the verified Basirah project at [Railway](https://railway.com/) (`9837ef84-08f3-4228-b7ac-f3b3dc25fba0`).
2. Use its existing `staging` and `production` environments and shared `api` service. Do not create a duplicate always-on backend.
3. In Railway, generate a project-scoped token following the [Railway CLI authentication guide](https://docs.railway.com/cli#authentication). Prefer a project token over an account-wide token.
4. In GitHub, add `RAILWAY_TOKEN` separately to the `staging` and `production` environments. Do not use a repository variable for the token.
5. Confirm the existing non-secret Railway service identifier `4d15a8f1-0028-42d6-adfa-cef07e55a9bc` as environment variable `RAILWAY_SERVICE_ID`.
6. Add runtime values such as `DATABASE_URL` and provider keys directly to the matching Railway environment.

The service identifier is already present in both GitHub environments. `RAILWAY_TOKEN` is deliberately absent from GitHub. The staging runtime `DATABASE_URL` exists only inside Railway, and production has no accepted runtime connection. The workflow pins `@railway/cli` and cannot run while `DEPLOY_STAGING_ENABLED` or `DEPLOY_PRODUCTION_ENABLED` is false.

### Vercel frontend and bot

Vercel's [GitHub integration](https://vercel.com/docs/git/vercel-for-github) is connected to `smaq777/Basira-Hackathon`, and current pull requests receive Vercel preview checks. The final production branch and committee alias still require release-gate read-back; preview success is not production acceptance.

For the checked-in GitHub Actions deployment path:

1. Create a scoped token in [Vercel account tokens](https://vercel.com/account/tokens).
2. Link or create the Basirah project and obtain its project/team identifiers from the project settings or `.vercel/project.json`; do not commit the `.vercel` directory.
3. Add `VERCEL_TOKEN` as a GitHub `staging` and `production` environment secret.
4. Add `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as non-secret environment or repository variables.
5. Configure Preview and Production values in [Vercel environment variables](https://vercel.com/docs/environment-variables). Never place a private key in a `VITE_*` variable.

Until the split frontend has an implemented API origin, cookie, CORS, and CSRF policy, Vercel is a preview of the web build; Railway remains the honest single-origin application deployment.

## GitHub configuration

Repository deployment switches are non-secret variables:

- `DEPLOY_STAGING_ENABLED`: global staging switch; default `false`.
- `DEPLOY_PRODUCTION_ENABLED`: global production switch; default `false`.
- `DEPLOY_RAILWAY_ENABLED`: provider switch; default `false`.
- `DEPLOY_VERCEL_ENABLED`: provider switch; default `false`.

Set secrets through **Settings → Environments → staging/production → Environment secrets**. Keep production approval manual. GitHub Actions logs must never echo secret values.

## Local setup

Copy the names manually from `.env.example` into an ignored `.env` only when a feature actually needs them. Do not commit generated `.env`, `.vercel`, `.railway`, `.mcp`, Codex, editor-agent, credential, transcript, or team-note files. The policy check rejects known credential patterns but does not replace revocation or a full history scan.

## Rotation and incident response

1. Revoke or rotate the exposed credential at the provider first.
2. Disable the affected deployment/integration and preserve sanitized evidence privately.
3. Identify where the value appeared: working tree, commit history, Actions log, deployment output, issue, or artifact.
4. Open a private security report. Do not paste the value into a public issue.
5. Use an owner-approved history rewrite only if needed; coordinate because it invalidates clones and open branches.
6. Re-run the full-history scan and verify the replacement credential with minimum scope.
