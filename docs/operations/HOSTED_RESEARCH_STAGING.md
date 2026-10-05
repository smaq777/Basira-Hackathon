# Connected research on the shared staging app

Related to #69/#14/#20. This opt-in permits real source, Neon and model testing
through the existing Basira UI on Railway staging. Defaults remain off. Saleh
accepts dependencies, configures the selected service and deploys; this document
does not claim a hosted run or grant production deployment authority.

Owner PR #97 at development `f130560` adds a separate `FOUNDATION_HOSTED_DEMO`
mode for pinned read-only RAG/model assessment without Python assets. That mode
and its restrictions are preserved. This full staging profile uses the canonical
Python/index path and can explicitly enable the existing Tafsir, web/cache and
rewrite features. The two opt-ins are mutually exclusive. The hosted demo's
quotation-unavailable disclosure remains; it is not canonical quotation verification.

## Activation boundary

Choose `FOUNDATION_RESEARCH_PROFILE=hosted-staging` only on the intended Railway
service in an environment named exactly `staging`. The runtime requires all of:

- `FOUNDATION_ENABLED=true`, `FOUNDATION_RESEARCH_PREVIEW=true`, `HOST=0.0.0.0`
  and `NODE_ENV=production`. The last setting retains Secure cookies and proxy
  handling for the hosted process; it does not select the production release.
- `BASIRAH_DEPLOYMENT_ENVIRONMENT=staging`,
  `BASIRAH_DEPLOYMENT_REF=refs/heads/development` and
  `BASIRAH_DEPLOYMENT_SHA` equal to the accepted 40-character source commit.
- `FOUNDATION_STAGING_SERVICE_ID` equal to Railway's actual `RAILWAY_SERVICE_ID`.
- Verified report/corpus TLS (`DATABASE_TLS_MODE=verify-full` and
  `FOUNDATION_CORPUS_TLS_MODE=verify-full`, both defaults).

Runtime also checks Railway's environment name and rejects conflicting Git branch
or commit metadata when supplied by Railway. Railway supplies Git metadata for
GitHub-triggered deployments; CLI uploads may lack it. See Railway's
[variable reference](https://github.com/railwayapp/docs/blob/main/content/docs/variables/reference.md)
and [CLI deployment guide](https://docs.railway.com/cli/deploying).

The three `BASIRAH_DEPLOYMENT_*` values are trusted operator declarations, not
cryptographic provenance. Saleh must verify the accepted commit and service in the
deployment receipt, update the declarations for that deployment and compare them
with actual platform metadata. Keep these values out of the production environment.
Staging workflow jobs now require `refs/heads/development`, including manual
dispatch; the production workflow and `vercel.json` remain unchanged.

`FOUNDATION_RESEARCH_PROFILE=local` retains the prior non-production loopback
behavior. Browser/request input cannot select either profile or provider flags.

## Required dependencies before activation

1. Accept the needed Foundation/cache/cleaning dependencies. Preserve owner ticket
   migrations 0013/0014 and deployment cleaning 0015. Fix/verify copied-role
   bootstrap under #81 before a fresh database chain; do not rewrite applied SQL.
2. Configure the report runtime `DATABASE_URL` and distinct
   `REVIEW_WORKER_DATABASE_URL` using their existing least-privilege roles.
3. Provision Python 3.11+ with SQLite/FTS5. Mount a vetted read-only evidence index,
   adjacent manifest and optional Tafsir snapshots; configure
   `FOUNDATION_PYTHON`, `FOUNDATION_DATABASE`, `FOUNDATION_SNAPSHOTS`. These assets
   are external to the clone. The packaged worker uses standard-library Python.
4. Configure separate Neon reader/cache writer URLs and pinned corpus version:
   `FOUNDATION_CORPUS_DATABASE_URL`, `FOUNDATION_CORPUS_VERSION`,
   `FOUNDATION_WEB_CACHE_DATABASE_URL`. The research database is
   `basirah_research`; it is separate from the report database. Optional content
   and passage flags require their checked-in schema and verified backfill.
5. Configure server-only OpenRouter and selected discovery-provider credentials.
   Explicitly enable semantic/retrieval/discovery/cache/Tafsir/rewrite flags for
   the intended test. The profile does not enable any of them automatically.
   Use the bounded [research budgets](SETUP.md), including the outer review deadline.
6. Deploy the accepted development revision to the selected staging service and
   build the Vercel preview with `vercel.staging.json`. Verify the named public
   alias actually serves this preview and its same-origin API proxy.

Pending research sources stay pending; cleanup, topic labels or this profile do
not establish edition, rights or scholarly approval. Quotation/source hashes,
3000 UTF16 units, five claims, guest ownership, retention, quotas, rate limits,
safe source policy, cancellation and evidence-bound rewrite guards are unchanged.

## Evidence required for a working deployment

Record exact frontend/backend revisions and the selected environment/service.
Verify `/ready`, then capabilities through the actual UI origin. Neither endpoint
alone proves source delivery. Submit a declared public fixture through that UI;
read its persisted owned report and confirm pinned corpus retrieval, model outcomes,
exact attributable evidence and provisional labels. Exercise outage/draft recovery
and guest isolation. Inspect the resulting browser screen, not just static build CI.

Rollback by disabling the individual provider flags or `FOUNDATION_ENABLED`.
Existing reports and original/cache source data remain intact. Restore `local`
only with its loopback/non-production settings; it is not a public fallback.
