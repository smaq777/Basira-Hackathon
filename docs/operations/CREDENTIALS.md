# Credentials and provider onboarding

**Checked 6 October 2026.** Judges need no credentials to use [staging](https://api-staging-42bc.up.railway.app/). Offline software tests also need no paid keys. The following instructions are for an authorized operator reproducing implemented integrations in their **own** environment; they are not permission to purchase credits, rotate shared keys or migrate shared databases.

Never share account passwords, cookie values, connection strings or private keys in GitHub, videos or logs. Use provider secret variables or ignored local environment files. All `VITE_*` values are browser-visible. Preserve existing working connections, TLS, corpus, service/environment and deployment-SHA guards.

## 1. OpenRouter: text inference and embeddings

Official: [authentication](https://openrouter.ai/docs/api_reference/authentication), [key dashboard](https://openrouter.ai/settings/keys), [documentation](https://openrouter.ai/docs).

1. Sign in with the account whose authorized budget will pay for this environment.
2. In **Keys**, create a named environment-specific API key. Set an owner-approved credit/spend limit; check account credit and model/provider access. Do not remove limits to cure a 403.
3. Save its value privately as `OPENROUTER_API_KEY` on the API service. The public application must never receive it.
4. The implemented text assessor uses `FOUNDATION_ASSESSOR_MODEL` (default `openai/gpt-6.1-sol`); record actual response model/provider identities. Query embeddings use fixed `openai/text-embedding-3-small`, 1536 dimensions, through the same gateway.
5. Make one bounded synthetic model request and one embedding request. Retain the first status/error category; stop at failure rather than repeated paid retries. A key spending limit, account credit and provider-routing denial are different diagnoses.

The current embedding adapter does not require a separate direct OpenAI key. Historical `LLM_API_KEY`, `LLM_MODEL`, `COHERE_API_KEY`, `EMBEDDING_MODEL=embed-v4.0` and dimension 1024 are not the selected Foundation runtime contract.

## 2. Gemini: availability-only text backup

Official: [API key guide](https://ai.google.dev/gemini-api/docs/api-key), [AI Studio API keys](https://aistudio.google.com/api-keys).

1. Sign in to your authorized Google account/Cloud project. In AI Studio, select/import the intended project and create its Gemini API key using the current project-permission workflow.
2. Follow Google's current application/API restrictions and billing/quota guidance. If permission is denied, ask that project's administrator; do not use another person's project.
3. Store `GEMINI_API_KEY` and, only if owned/approved, `GEMINI_API_KEY_2` in the staging server secret environment.
4. Explicitly set `FOUNDATION_GEMINI_BACKUP_ENABLED=true` in an accepted runtime configuration. The adapter uses `gemini-2.5-flash` via `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.
5. Verify key-presence/activation booleans and a bounded synthetic request without printing values. Do not disrupt the shared primary to manufacture a fallback test.

Backup is for eligible availability failures, not invalid output or meaning/scope rejection. The same validators still apply, and it does not replace OpenRouter query embeddings. See [backup runbook](GEMINI_BACKUP.md).

## 3. Tafsir MCP: public religious-source tools

Official: [project](https://tafsirmcp.netlify.app/), [upstream code](https://github.com/tafsircenter/tafsir-mcp).

No key is required by the current public adapter at `https://mcp.tafsir.net/mcp`. It performs MCP initialization/tools-list/schema checks before calls. Hosted code pins the endpoint/protocol; merely changing historical `TAFSIR_MCP_URL` does not imply every adapter will retarget. Enable `FOUNDATION_TAFSIR_LIVE` only in an allowed configured mode following [integration](../architecture/FOUNDATION_INTEGRATION.md).

Do not install a local MCP server for judges or invent an auth variable. Test Quran 7:31 with canonical Quran plus independently attributed Moyassar and Saadi. Access, edition rights and qualified source approval remain separate.

## 4. Quran.com canonical text versus newer Foundation APIs

Official: [Quran.com](https://quran.com/), [Foundation API quickstart](https://api-docs.quran.foundation/docs/quickstart/).

Current [adapter](../../apps/api/src/quran-api.ts) reads public `https://api.quran.com/api/v4/quran/verses/uthmani`; it does not send an API key. Newer Quran Foundation OAuth APIs have their own access/credential onboarding; follow the official quickstart if implementing a future migration. No client-ID/secret variable or OAuth integration is claimed in the accepted adapter. Do not replace a working endpoint just to add a key.

## 5. Neon research database and optional developer MCP

Official: [console](https://console.neon.tech/), [connection documentation](https://neon.com/docs/connect/connect-intro), [management API authentication](https://api-docs.neon.tech/reference/authentication).

**SQL runtime:**

1. In the owner's console, select the correct project, branch, database and dedicated role. Use the Connect dialog to obtain that role's connection string privately.
2. Configure `FOUNDATION_CORPUS_DATABASE_URL` for the research reader, `FOUNDATION_CORPUS_TLS_MODE=verify-full`, and accepted `FOUNDATION_CORPUS_VERSION`. Retain any required CA certificate. Never substitute a database-owner role.
3. A separately authorized publication path uses `REVIEWER_CORPUS_DATABASE_URL`, its own role/verified TLS and `REVIEWER_CORPUS_VERSION=reviewed-<frozen-pin>`. Reader and writer must target the same intended database under distinct roles; binding/least-privilege guards remain enabled.
4. Optional retained-page caching uses `FOUNDATION_WEB_CACHE_DATABASE_URL` and its scoped role, not a general admin connection.
5. For new isolated environments, follow checked-in migration/runbooks explicitly. **Do not rerun ingestion, embeddings, grants or migrations on the already activated staging corpus merely to reproduce the demo.**

SQL credentials are not Neon management API keys. The report/session `DATABASE_URL` in active staging references **Railway report PostgreSQL**, not this corpus DB.

**Optional operator API/MCP:** use the official console API-key management flow; choose the narrowest supported project scope and keep it in the operator's private MCP/CLI secret configuration. Management tools provision/inspect infrastructure; they are not runtime religious evidence. No management key is needed by the SQL adapter or public guest. Do not commit MCP configuration or agent transcripts.

## 6. Railway: single-origin submission deployment

Official: [Railway](https://railway.com/), [CLI authentication](https://docs.railway.com/cli#authentication), [variables](https://docs.railway.com/variables).

1. The existing authorized operator can use `railway login`; automation should use an appropriately scoped project/environment token created by that owner. Store tokens privately, not as repository variables.
2. Select the existing project/API/staging, not a duplicate service:
   - Project `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`.
   - Service `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`.
   - Environment `97179b92-48b1-412f-95ff-1901bb826458`.
3. Configure report `DATABASE_URL`, dedicated `REVIEW_WORKER_DATABASE_URL` and verified TLS/CA according to accepted report-store setup. Connection strings remain secret; source DB and report DB are not interchangeable.
4. Configure server keys in the API service's staging variables. Public Clerk key must also exist at frontend build time. Preserve declarations and hosted-demo guards.
5. Read the accepted development SHA; align `BASIRAH_DEPLOYMENT_SHA` with the exact source deployment using the [operator procedure](SUBMISSION_CORPUS_ACTIVATION.md). A docs-only Git merge can still trigger deployment; a stale SHA guard can intentionally stop startup.
6. Require deployment SUCCESS and actual SHA/service/environment match, then HTTP200 health/readiness/capabilities. Do not disable guards or promote `main`.

GitHub deployment automation is a separate optional path. Its `RAILWAY_TOKEN` belongs in an environment secret; checked-in deploy switches are not proof that an Actions deployment is enabled.

## 7. Clerk: reviewer sign-in

Official: [dashboard API keys](https://dashboard.clerk.com/last-active?path=api-keys), [environment reference](https://clerk.com/docs/guides/development/clerk-environment-variables), [React quickstart](https://clerk.com/docs/react/getting-started/quickstart).

1. Create/select your application's intended development/staging instance in the Clerk dashboard.
2. From its API Keys page copy the **publishable key** into `VITE_CLERK_PUBLISHABLE_KEY` for the web build and `CLERK_PUBLISHABLE_KEY` for backend verification.
3. Put **secret key** only in server `CLERK_SECRET_KEY`. These app keys are different from Clerk's optional end-user machine-auth API-key product.
4. Configure exact `CLERK_AUTHORIZED_PARTIES` and `CLERK_FRONTEND_API_ORIGIN` for the accepted site; avoid wildcard origins.
5. Production/default authorization is `CLERK_REVIEWER_ACCESS_MODE=allowlist` with owner-approved `CLERK_REVIEWER_USER_IDS`. Hackathon staging can explicitly use `authenticated` so judges may sign in without a manual allowlist.
6. Source-publication authorization has its separate `REVIEWER_CORPUS_ACCESS_MODE` guard; do not assume signing in grants arbitrary database access. Verify anonymous rejection and authenticated behavior.

Signing in proves application identity, not scholarly expertise. Restore restricted production policy after the evaluation window.

## 8. Brevo: ticket and published-review email

Official: [key creation](https://help.brevo.com/hc/en-us/articles/209467485-Create-and-manage-your-API-keys), [API quickstart](https://developers.brevo.com/docs/quickstart), [sender troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

1. In your Brevo account, open **Settings → SMTP & API → API Keys & MCP**, generate a named REST API key, complete required verification and retain its one-time value securely. Do not convert it to an MCP-only key: this application uses REST.
2. Verify the From sender/domain and any required transactional activation. Configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `PUBLIC_APP_URL` together on the server.
3. Tickets also require `TICKETS_ENABLED`, independent environment-specific `TICKET_DATA_KEY` (32-byte base64) and `TICKET_LOOKUP_PEPPER`. Generate locally using a cryptographic generator; never put the values in issue text.
4. Test only an owned ticket with explicit contact consent and a consenting mailbox. Publish its report once; check outbox, provider message acceptance and subsequent delivery-event reconciliation separately.
5. If delivery fails, retain its status/reason; check sender verification, account activation/quota, suppression/bounce/security and mailbox spam. An API acceptance ID is not delivery proof.

A ticket without contact consent must not generate email. Reviewer publication is not automatic RAG admission; source/rights approval is separate. Actual transport is `https://api.brevo.com/v3/smtp/email`; receipts use Brevo transactional event API. Never expose recipient contact data publicly.

## 9. Optional discovery: Firecrawl and TinyFish

**Firecrawl:** [official dashboard guidance](https://github.com/firecrawl/firecrawl-docs/blob/main/dashboard.mdx), [dashboard](https://www.firecrawl.dev/), [docs](https://docs.firecrawl.dev/). Sign in, open API Keys, create an environment-specific key, save as `FIRECRAWL_API_KEY`, and check credits/owner spend limits. Enable only the intended `FOUNDATION_WEB_DISCOVERY_ENABLED` path and source-policy configuration. Search/scrape responses are candidates, not approved evidence.

**TinyFish:** [official key guide](https://www.tinyfish.ai/blog/tinyfish-web-agent-getting-started-10-minutes), [account](https://agent.tinyfish.ai/), [docs](https://docs.tinyfish.ai/). Create/sign in to your account, open API Keys, create a key and store its one-time value privately as `TINYFISH_API_KEY`. Select the accepted `FOUNDATION_WEB_PROVIDER` adapter with the existing policy/budget guards. Basirah implements Search/Fetch REST, not TinyFish's autonomous Agent or MCP interface. Current assembly also requires Firecrawl configuration for the enabled discovery path; do not infer independent activation from the TinyFish key alone.

Neither optional adapter is required for the Quran/Tafsir judge example. Source policies, rights and exact-text/relevance validation apply regardless of provider.

## 10. Nonintegrated sources and submission URL policy

The owner has selected Railway API staging exclusively. Do not offer or submit a Vercel URL, and do not set up an alternate submission deployment.

Dorar is disabled after 403; no working supported credential is claimed. Quranpedia, Islamic Content, Dawah Center and Shamela are discovery/reference websites, not accepted API-key integrations. Cohere remains a historical candidate; do not create its key or alter vector dimensions for this release. See the [source registry](../api/PROVIDERS.md).

## Secure storage, rotation and test scope

- Backend keys belong in the owning provider or GitHub **environment secrets**, never public variables/source. Connection strings are secrets even without KEY in their names.
- Use independent staging/production key, encryption and lookup material. Do not promote production as part of submission preparation.
- Revoke/rotate a leaked credential first, then investigate working tree/history/log exposure through the private [security process](../../SECURITY.md). Public policy checks do not prove a full historical secret audit.
- Keep a sanitized receipt: timestamp, accepted/deployed SHA, statuses, provider/model, corpus/prompt versions and key-presence booleans only. No raw environment dumps, headers, cookies or contact data.
