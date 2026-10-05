# Connect the Vercel staging frontend

Related to [#69](https://github.com/smaq777/Basira-Hackathon/issues/69). This
runbook connects a selected **Preview** deployment to the existing Railway
staging API. The root `vercel.json` remains a static shell configuration.

## Build and deploy an exact accepted staging revision

Vercel documents the [local config CLI option](https://vercel.com/docs/cli/global-options#local-config)
and [external rewrites](https://vercel.com/docs/routing/rewrites). This repository
uses the external rewrite only in the separately selected staging configuration.

Use Node 24 and npm 11. From the accepted checkout, confirm the Vercel project is
`basirah` under `smaq777-hotmailcoms-projects`. Read back the linked project's ID
before deployment; do not select another account/project or use `--prod`.
Record `git rev-parse HEAD` and the returned unique preview URL with the Vercel
deployment details. GitHub automatic PR previews use root `vercel.json` unless
the project explicitly selects the staging configuration, so a green Vercel
check alone does not prove API connectivity.

```sh
npx -y vercel@62.1.0 link --project=basirah --scope=smaq777-hotmailcoms-projects
npx -y vercel@62.1.0 pull --yes --environment=preview
npx -y vercel@62.1.0 build --local-config=vercel.staging.json
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
   the HTML frontend. Check `guestDocuments=true` before baseline intake.
2. Submit a synthetic non-private Arabic draft. In browser network tools,
   confirm the session POST sets `basirah_guest` with `HttpOnly`, `Secure` and
   `SameSite=Strict`, and the next document POST sends that cookie to the
   **same preview origin**. The draft body must arrive unchanged. Record only
   method/status/cookie attribute evidence, never the cookie value.
3. Confirm another clean browser cannot read the first browser's document.
   Delete the diagnostic guest session through `DELETE /api/v1/session`.
4. Verify the deployed Git revision in Vercel and Railway deployment details
   against the accepted commits. Asset names alone do not identify a revision.
5. For PR #59's connected review, additionally require
   `foundationReview=true`. An absent/false value is an older or disabled
   backend; `reviewOrchestration=true` and `/ready=200` are insufficient. Do not
   substitute labelled demo results for a failed connected review.

The inspected Railway instance is at migration 0005 and lacks
`foundationReview`. Connecting this existing backend repairs baseline intake,
but does not provide PR #59 source reports. That follow-up needs an accepted
compatible backend, isolated staging migration verification, approved runtime
configuration and source/provider prerequisites. No production migration or
release is authorized by this runbook.

## Rollback

Return the staging alias to the prior verified compatible Preview URL, or
redeploy that exact revision/configuration. This change adds no schema and
changes no production routing. A returned static shell will again report
missing routing explicitly; it must not be described as a connected review.
