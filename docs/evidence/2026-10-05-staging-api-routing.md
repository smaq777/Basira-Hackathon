# Staging frontend connection diagnostic

Related to [#69](https://github.com/smaq777/Basira-Hackathon/issues/69). Read-only
public HTTP observations on 5 October 2026; no deployment, migration or provider
analysis was performed by this diagnostic.

| Request                                                           | Observed result                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vercel `https://basirah-smaq777-hotmailcoms-projects.vercel.app/` | 200 HTML; asset `/assets/index-kMz-VjAT.js`                                                                |
| Same Vercel origin `/api/v1/capabilities`                         | 404 `text/plain`; Vercel `NOT_FOUND`                                                                       |
| Railway `https://api-staging-42bc.up.railway.app/health`          | 200 JSON; `stage=mvp_backend`                                                                              |
| Railway `/ready`                                                  | 200 JSON; `migrationVersion=0005_expired_guest_cleanup`                                                    |
| Railway `/api/v1/capabilities`                                    | 200 JSON; `guestDocuments=true`, `reviewOrchestration=true`, `liveProviders=[]`; `foundationReview` absent |

The inspected public JavaScript uses relative fetch paths and
`credentials: 'same-origin'`. It contains no foundation-report capability or
review calls and no Railway origin. The existing root `vercel.json` publishes
only static web output. These observations identify missing same-origin API
routing as the immediate connection failure. They also show the deployed
frontend/backend are an older foundation baseline, rather than evidence that
draft PR #59 is deployed or owner-accepted. Readiness through migration 0005 is
not readiness for the newer persisted source reports.

## Bounded change

`vercel.staging.json` provides an explicit fixed-upstream API rewrite. Staging
deployment commands select it; the root configuration and production workflow
do not route to staging. Browser requests remain same-origin. The new client
checks `guestDocuments` before sending a draft, identifies non-JSON 404/HTML
responses as missing routing, and keeps storage and foundation unavailability
distinct from transport failures. `requireAnalysisCapability('foundationReview')`
is available for the PR #59 integration; the baseline flow checks only storage
because its result remains a labelled demonstration.

The external rewrite is intended to forward methods, request bodies, cookies,
and response `Set-Cookie` headers through the frontend origin. This must be
verified on an explicitly selected staging preview before claiming success.
No cross-origin cookie mode, permissive CORS or arbitrary upstream is added.

## Owner deployment and acceptance

Local validation used Node 24.19.0 and npm 11.19.0 with the existing matching
dependency installation: 145 Vitest tests passed across 10 files with
`--pool=threads`; typecheck, documentation links, policy scan, production bundle
and changed-file Prettier checks passed. The default sandbox could not spawn
test/build child processes; worker threads and authorized local build checks
resolved that environment restriction. Full-checkout formatting reports CRLF
differences in untouched baseline files on this Windows worktree; those files
were not reformatted. Hosted proxy cookie/body/ownership smoke remains pending.

Follow the [staging connection runbook](../operations/STAGING_CONNECTION.md).
The code fixes routing configuration; it does not enable the foundation worker,
apply migrations, provision a source corpus or deploy PR #59. Those are separate
gates. Acceptance and issue closure remain with Saleh.
