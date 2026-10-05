# Local development setup

## Optional conservative source content views

`FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED=false` preserves topic-only admission
and original/v1 delivery. Enabling requires the existing research cache configuration
and reviewed migration `0015`. New public pages receive one joint topic/block-label
request; existing retained originals need an explicit frozen zero-provider sidecar
backfill after their classification diagnostic. Derived body windows use lexical
selection, with no cleaned-view embeddings. Read the [source-bound selection,
operator and rollback limits](../evidence/2026-10-05-source-content-views.md).

## Optional retained-page passage index

`FOUNDATION_WEB_CACHE_PASSAGES_ENABLED=false` keeps the legacy cache path. Enabling
it requires the existing research cache configuration, reviewed migrations `0011`/`0012`
and an explicit offline backfill. Read the [bounded operation and rollback](../evidence/2026-10-05-cache-passage-index.md).
Runtime discovery does not embed a page's passages automatically.

## Optional supported-author wording candidate

Set `FOUNDATION_REWRITE_ENABLED=true` only in an already configured loopback
foundation research preview with `FOUNDATION_RESEARCH_PREVIEW=true`,
`FOUNDATION_ENABLED=true`, and the owning `OPENROUTER_API_KEY`. It defaults off;
production startup rejects activation. The result page reads server capabilities
before showing «تحسين الصياغة وإضافة التوثيق». It improves only exact supported
author claim spans and offers before/after changes. A separate model request
checks mutual meaning preservation and source support before validated copy.
Quotations and unreviewed/unsupported text remain unchanged. Generation and
verification share a 90-second ceiling; failure retains the original. It cannot
change a contradicted claim's meaning or correct a quotation. Pending source
status is retained. Candidate storage is
session-bound process memory with a ten-minute TTL; no durable recovery is claimed.
See [architecture](../architecture/AI_REWRITE.md) and
[software and paid diagnostic evidence](../evidence/2026-10-05-substantive-rewrite.md).

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

Open `http://localhost:3000`. The Node server serves built React assets and the API from one origin. `/health` reports process liveness. `/ready` returns 503 when the report database is unavailable and reports readiness when its required migrations are present. Read `/api/v1/capabilities` for configured features; owned review creation and report processing require the corresponding database and enabled foundation worker. Provider names in capabilities identify configured adapters, not successful provider health or religious verification.

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

Human-review tickets require migration `0014_direct_review_ticket_intake` and `TICKETS_ENABLED=true`.
Configure a base64 32-byte `TICKET_DATA_KEY` and a separate random `TICKET_LOOKUP_PEPPER` of at least
32 characters. Both are server-only and environment-specific. The public follow-up route always
requires both the non-sequential ticket code and normalized email, is rate limited, and returns the
same not-found shape for a wrong code or wrong email. Configure all Brevo variables together only
after its sender is verified; otherwise reviewer publishing remains durable while email delivery is
disabled. A published response is not active RAG evidence until a separate reviewer action records
its source reference and provenance.

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
The default optional phase is bounded to 60 seconds: extraction has a 12-second request
limit and assessment a 45-second default limit. The worker also caps this phase to the
time remaining before the review deadline, reserving five seconds for persistence.
The default review deadline remains 60 seconds. For the authorized full-writing
local pilot, set `REVIEW_DEADLINE_SECONDS=90` before starting the API; this is a
bounded experiment setting, not a measured service-level guarantee. One frozen
five-claim assessment took 32.694 seconds, which exceeded the former 12-second
request limit. See the [full-writing evidence](../evidence/2026-10-05-ui-input-refinements.md).

Disable `FOUNDATION_SEMANTIC_ENABLED` to roll back model use. This does not alter
stored reports or enable rewriting. See the [pilot evidence](../evidence/2026-10-04-model-and-arabic-rag-pilots.md).

## Research cache and discovery profile — 5 October

All foundation, semantic, retrieval, discovery, and cache flags default off. Live research activation requires `NODE_ENV` other than production, `HOST=127.0.0.1` or `::1`, and `FOUNDATION_RESEARCH_PREVIEW=true`. It is not a production deployment setting.

For a time-bounded public hackathon demonstration, `FOUNDATION_HOSTED_DEMO=true`
selects a separate read-only hosted profile. It starts from the immutable submitted
draft, retrieves only from a pinned `FOUNDATION_CORPUS_VERSION`, and keeps pending
records visibly research-only. It does not perform literal quotation verification
without the packaged canonical index. Live Tafsir/MCP acquisition, web discovery,
cache writes and rewrite are rejected in this profile. Configure a dedicated report
worker login, a least-privilege research corpus reader and the server-only model key;
never reuse an owner URL or expose a credential to the browser.

Enable `FOUNDATION_ENABLED`, `FOUNDATION_SEMANTIC_ENABLED`, `FOUNDATION_CLAIM_RETRIEVAL_ENABLED`, `FOUNDATION_WEB_DISCOVERY_ENABLED`, and `FOUNDATION_WEB_CACHE_ENABLED` only for an authorized research run. Keep the local Python executable/index, report runtime login, and separate worker login configured as described in `.env.example`. The report database needs migration 0007 for source review and at least 0009 for claim retrieval. The separate Neon corpus/cache database needs the populated versioned corpus and migration `0010_research_page_cache`. Apply checked-in migrations only to the explicitly selected isolated development database with its direct migration credential; never place owner credentials in runtime configuration.

`FOUNDATION_CORPUS_DATABASE_URL` uses the existing least-privileged research reader and `FOUNDATION_CORPUS_VERSION` selects the frozen corpus. `FOUNDATION_WEB_CACHE_DATABASE_URL` uses a separate cache writer login: only cache SELECT/INSERT and verification/expiry updates, no canonical-corpus changes or source approval. Both use `FOUNDATION_CORPUS_TLS_MODE`, default `verify-full`. Provider keys remain server-only in the owning external environment: `OPENROUTER_API_KEY`, `FIRECRAWL_API_KEY`, and, when selected, `TINYFISH_API_KEY`.

Default `FOUNDATION_WEB_PROVIDER=firecrawl` uses Firecrawl. Explicit `tinyfish_first` tries Tinyfish first and retains Firecrawl fallback within the bounded discovery budget. `FOUNDATION_WEB_POLICY_PATH` may name a trusted operator JSON policy; empty uses `config/source-policy.json`. At most two eligible originals are acquired for one explicit evidence gap. Eligibility does not establish source rights, scholarly authority, or approval.

The authorized cache research profile is:

```dotenv
FOUNDATION_SEMANTIC_TIMEOUT_MS=240000
FOUNDATION_EXTRACTION_TIMEOUT_MS=20000
FOUNDATION_ASSESSMENT_TIMEOUT_MS=90000
FOUNDATION_WEB_DISCOVERY_TIMEOUT_MS=65000
FOUNDATION_GAP_ASSESSMENT_TIMEOUT_MS=45000
REVIEW_DEADLINE_SECONDS=300
```

These are ceilings, not additive guaranteed processing time or a service-level promise. The worker uses remaining deadline budget and preserves time for persistence; acquisition, classification, and cache writes share the discovery stage. Cache activation requires the extended 65-second discovery setting. The default budgets remain 60/45/8/18 seconds and a 60-second outer review deadline.

Validated public-page originals are automatically machine-topic-classified and saved to a separate pending research cache; private draft/query/review provenance is excluded. Future initial claim retrieval searches eligible cached originals alongside the frozen hosted corpus, so a weak cached match cannot suppress later gap discovery. TTL defaults to 30 days; expired, revoked, or old-policy entries are excluded. Fresh matching acquisition can refresh expiry without changing originals; the writer cannot remove revocation. See [cache evidence](../evidence/2026-10-05-reusable-research-page-cache.md). Disable the optional flags to stop provider/cache use; existing reports remain durable and rewriting stays unavailable.
