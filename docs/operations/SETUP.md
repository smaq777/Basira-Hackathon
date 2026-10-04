# Local development setup

## Prerequisites

- Node.js 24 LTS and npm 11. The root `.nvmrc` and `package.json` declare this version range.
- Git and repository read access while the project remains private.
- No database or model key is needed for foundation tests.

```bash
npm ci
npm run check
npm run dev:api
```

In a second terminal, run `npm run dev:web`. Open `http://localhost:5173`; the API listens on `http://localhost:3000`. Vite proxies `/api` during development. Set `PORT` explicitly if necessary; update the development proxy if changing the API port.

For a production-style local build:

```bash
npm run build
npm start
```

Open `http://localhost:3000`. The Node server serves built React assets and the API from one origin. `/health` reports process liveness. `/ready` intentionally returns 503; `/api/v1/reviews` intentionally returns 501. These are honest foundation behaviors, not broken completed features.

## Environment variables

`.env.example` documents intended variable names. Secret fields are blank. The current process reads environment variables provided by the shell/platform; it does not implicitly load `.env`. Use the [credential onboarding guide](CREDENTIALS.md) only for integrations marked implemented. For an explicit local file after building, Node supports:

```bash
node --env-file=.env dist/apps/api/src/server.js
```

Keep `.env` untracked. Database and Clerk server secrets stay outside the browser. The Clerk
publishable key is the only authentication value permitted in `VITE_CLERK_PUBLISHABLE_KEY`; it is
designed to be public. Never place `CLERK_SECRET_KEY`, a database URL or a model/provider secret in
any `VITE_*` variable because those values are embedded in the browser build.

Without Clerk configuration, direct reviewer routes display an unavailable state and the protected
API returns `503`; they do not fall back to the dummy workspace. With Clerk configured, the browser
must obtain a valid session. The default `CLERK_REVIEWER_ACCESS_MODE=allowlist` then requires the
API to find the user in `CLERK_REVIEWER_USER_IDS`. A hackathon staging deployment may explicitly
use `authenticated` to admit any signed-in participant; anonymous requests remain blocked, and
production must retain the allowlist policy until roles and permissions are implemented. Use exact
origins in `CLERK_AUTHORIZED_PARTIES` and keep public guest
review independent from reviewer authentication. Use the browser origin (`http://localhost:5173`
for Vite), not the proxied API port. Production origins must be HTTPS; malformed origins abort
startup instead of weakening token binding or the response CSP.

## Commands

| Command                        | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `npm run typecheck`            | TypeScript consistency                             |
| `npm test`                     | Deterministic contracts and HTTP foundation tests  |
| `npm run docs:check`           | Local Markdown link and required-document checks   |
| `npm run policy:check`         | Bounded repository safety and documentation checks |
| `npm run format:check`         | Formatting consistency                             |
| `npm run build`                | Compile API and build web shell                    |
| `npm run check`                | All of the above                                   |
| `npm audit --audit-level=high` | Dependency vulnerability check at the time run     |

Use `npm ci` in CI for locked dependencies. If a dependency changes, regenerate the lockfile with npm, review the diff and rerun checks. An audit with zero findings is not proof that the application is vulnerability-free.

## Troubleshooting

- An unsupported Node version can fail tooling even if installation appears successful; activate Node 24 first.
- Provider errors cannot be fixed by adding arbitrary credentials to the browser. Keep integrations server-side.
- Missing database/model keys should not prevent foundation tests; production feature readiness remains separate.
- Read [deployment](DEPLOYMENT.md) before connecting live services. No shared/production migration should run as part of ordinary local tests.

## Optional local semantic experiment

Apply migration `0007_complete_quotation_findings` before source review. Keep
`FOUNDATION_SEMANTIC_ENABLED=false` unless an operator has authorized the test
payload to be sent to OpenRouter and its selected provider. Activation requires
`FOUNDATION_RESEARCH_PREVIEW=true`, a loopback `HOST`, non-production mode and a
server-only `OPENROUTER_API_KEY` from the owning project. No key belongs in Vite or
browser storage. Missing keys produce an unavailable semantic result while source
results remain available.

The tested defaults use `openai/gpt-6-luna` for extraction and
`openai/gpt-6.1-sol` for assessment, both at low reasoning through OpenAI. The
optional `FOUNDATION_ASSESSOR_MODEL` accepts only those allowlisted models. There
is no runtime fallback configured; unavailable providers do not produce a verdict.
The optional phase is bounded to 60 seconds: extraction has a 12-second request
limit and assessment a 45-second limit. The worker also caps this phase to the
time remaining before the review deadline, reserving five seconds for persistence.
The default review deadline remains 60 seconds. For the authorized full-writing
local pilot, set `REVIEW_DEADLINE_SECONDS=90` before starting the API; this is a
bounded experiment setting, not a measured service-level guarantee. One frozen
five-claim assessment took 32.694 seconds, which exceeded the former 12-second
request limit. See the [full-writing evidence](../evidence/2026-10-05-ui-input-refinements.md).

Disable `FOUNDATION_SEMANTIC_ENABLED` to roll back model use. This does not alter
stored reports or enable rewriting. See the [pilot evidence](../evidence/2026-10-04-model-and-arabic-rag-pilots.md).
