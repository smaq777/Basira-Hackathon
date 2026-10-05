# Connect the Vercel staging frontend

Related to [#69](https://github.com/smaq777/Basira-Hackathon/issues/69). This
runbook connects a selected **Preview** deployment to the existing Railway
staging API. The root `vercel.json` remains a static shell configuration.

## Dated online check: 5 October 2026, 20:20 UTC

The [retained issue evidence](https://github.com/smaq777/Basira-Hackathon/issues/69#issuecomment-6002347726)
records a failed connected Vercel journey and one limited Railway result:

- The named alias `https://basirah-smaq777-hotmailcoms-projects.vercel.app`
  and the latest observed accepted Preview
  `https://basirah-orzbec0bf-smaq777-hotmailcoms-projects.vercel.app` both returned
  404 for `/api/v1/capabilities`. Both browser submissions displayed an unavailable
  API route and produced no report. The Preview deployment check reported success
  for `f78b54c41f72a06bbebcccc20d49c619b2c88ffd`; that did not establish API routing.
- Direct Railway staging returned `/ready=200` at migration
  `0014_direct_review_ticket_intake`. Its advertised profile was
  `hostedFoundationDemo=true`, `researchPreview=false`, `draftRewrite=false`.
  One public browser review rendered a durable partial report with provisional
  support and a visible Muyassar 31:15 citation, ten candidate sources, unchanged
  visible input, successful saved-result reload and an unauthenticated read rejected
  with 401. It showed zero literal quotation comparisons and the older generic
  results footer. This does not prove full Foundation research, quotation checking,
  source approval, rewrite or ticket readiness.
- The latest observed Railway deployment for the same accepted revision was
  `in_progress` at that check. The revision of the currently served Railway app was **not proven**;
  neither an asset name nor a successful result identifies that revision.

The source inspection found no API rewrite in root `vercel.json`, a fixed staging
proxy in `vercel.staging.json`, and explicit selection only in the gated staging
workflow. All four deployment flags were observed false. This is consistent with
the Vercel failure, but the actual platform route manifest was not inspected, so
the platform cause remains unconfirmed. Preserve this dated evidence rather than
describing the named frontend as connected or submission-ready.

The retained diagnostic is `STAGING_ONLINE_QA_2026_10_05_V1.json`; it records the
first online outcomes and their limits. No deployment, alias, environment, flag,
schema or production change was made by that diagnostic.

## Build and deploy an exact accepted staging revision

Vercel documents the [local config CLI option](https://vercel.com/docs/cli/global-options#local-config)
and [external rewrites](https://vercel.com/docs/routing/rewrites). This repository
uses the external rewrite only in the separately selected staging configuration.

Use Node 24 and npm 11. From the accepted checkout, confirm the Vercel project is
`basirah` under `smaq777-hotmailcoms-projects`. Read back the linked project's ID
before deployment; do not select another account/project or use `--prod`.
Record `git rev-parse HEAD` and the returned unique preview URL with the Vercel
deployment details. Automatic Git previews do not execute this separately gated
workflow. Read back the actual selected deployment configuration; a green Vercel
check alone does not prove selection of `vercel.staging.json` or API connectivity.
Saleh owns deployment, alias changes and acceptance. The following commands are
an operator handoff, not authorization to enable gates or promote production.

```sh
npx -y vercel@62.1.0 link --project=basirah --scope=smaq777-hotmailcoms-projects
npx -y vercel@62.1.0 pull --yes --environment=preview
npx -y vercel@62.1.0 build --local-config=vercel.staging.json
```

Before deploying, inspect the generated `.vercel/output/config.json` and require
an equivalent fixed mapping of `/api` paths to the same paths at
`https://api-staging-42bc.up.railway.app`. Generated rules may express the wildcard
as a regular expression and `$1`; they need not retain literal `:path*` syntax.
Stop if the generated route,
linked project or Preview environment differs from the reviewed plan. Then deploy
that exact prebuilt output with the same configuration:

```sh
npx -y vercel@62.1.0 deploy --prebuilt --local-config=vercel.staging.json
```

Use owning-platform authentication; do not put tokens in shell history or
documentation. The gated staging workflow uses the same configuration. Its
flags remain unchanged. The reported project alias does not establish whether
a deployment is Preview or Production. Test the unique Preview URL before an
authorized alias change; do not promote a preview to production to repair a
staging link.

## Verify routing, ownership and deployed capability

1. Open the unique preview in a clean browser. Request
   `/api/v1/capabilities`: it must return JSON from Railway, not Vercel 404 or
   the HTML frontend. Compare the declared profile with the intended compatible
   Railway revision. Check `guestDocuments=true` before baseline intake. Record
   the unique URL, Preview target, exact revision and generated API route before
   considering any named-alias change.
2. Submit a synthetic non-private Arabic draft. In browser network tools,
   confirm the session POST sets `basirah_guest` with `HttpOnly`, `Secure` and
   `SameSite=Strict`, and the next document POST sends that cookie to the
   **same preview origin**. The draft body must arrive unchanged. Record only
   method/status/cookie attribute evidence, never the cookie value.
3. Confirm another clean browser cannot read the first browser's document.
   Delete the diagnostic guest session through `DELETE /api/v1/session`.
4. Verify the deployed Git revision in Vercel and Railway deployment details
   against the accepted commits. Asset names alone do not identify a revision.
5. For a connected source review, additionally require `foundationReview=true`,
   then verify the intended profile and actual report boundaries. That flag alone
   does not establish full research or literal quotation checking: the hosted-demo
   profile has a distinct restricted path. `reviewOrchestration=true` and
   `/ready=200` are insufficient. Do not substitute labelled demo results for a
   failed connected review, or infer live researcher/source approval from support.

**Historical baseline:** The earlier inspected Railway instance was at migration
0005 and lacked `foundationReview`. That observation described the prior baseline
intake service, not the current state. The dated check above supersedes it for
observed migration/profile behavior while preserving the unproven live revision
and missing full-pipeline evidence. Full research still requires an accepted
compatible backend, isolated migration verification, approved runtime configuration
and source/provider prerequisites. No production migration or release is authorized
by this runbook.

## Rollback

Return the staging alias to the prior verified compatible Preview URL, or
redeploy that exact revision/configuration. This change adds no schema and
changes no production routing. A returned static shell will again report
missing routing explicitly; it must not be described as a connected review.
