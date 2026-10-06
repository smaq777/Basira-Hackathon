# Render hosting alternative

**Planned only — 6 October 2026.** Related to
[issue #174](https://github.com/smaq777/Basira-Hackathon/issues/174),
[provider issue #169](https://github.com/smaq777/Basira-Hackathon/issues/169) and
[submission issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157).
The user explicitly requested a separate planning branch. This proposal changes
documentation only: no application changes, deployable blueprint, service creation,
secrets transfer, purchase, database changes or cutover are included.

## Decision and limits

Render is a feasible alternative for the existing Node/Express application, but
it does not resolve an OpenRouter key limit or demonstrate working retrieval.
Restore and verify the actual staging provider key independently. Remaining
account balance does not establish that a particular API key has available quota.

Keep Neon unchanged: the existing corpus database, reader role, 175-passage
snapshot, embeddings and historical versions remain in place. The documented
report/worker database is a separate Railway PostgreSQL service; do not assume
that moving the app also moves those reports to Neon. Its current location and
external TLS connectivity must be verified privately before implementation.
See the [existing deployment record](../operations/DEPLOYMENT.md) and
[corpus activation](../operations/SUBMISSION_CORPUS_ACTIVATION.md).

Keep resolving the submission blockers on the current host while this alternative
is evaluated. A host migration adds work and cannot substitute for provider,
MCP, RAG and rewrite acceptance. Reviewer/publication, mobile design and
presentation work remain deferred.

Ownership confirmed by the user: Ahmed handles Render for one month through the
end of the hackathon; Saleh continues handling Neon and Railway. Saleh therefore
confirms database locations, roles and external connection availability. Any
Render renewal or continuation beyond that month requires a separate decision.

## Proposed topology and cost

Use one paid Render Node web service to serve the built React UI, HTTP API and
existing background review worker from the same origin. Keep one instance and
one Node process because rewrite candidates and some rate limits are in memory.
Do not use a free sleeping service for the submission demonstration.

Ahmed confirmed his Render account and $7/month for one service. Verify the
actual checkout fits that compute budget before any later provisioning; do not
upgrade or add paid services without separate authorization. This is not a
capacity guarantee: measure memory and
concurrency before acceptance. Neon, AI usage and any retained Railway database
charges are separate. Render ownership, compute budget and the one-month duration
are confirmed; service provisioning and checkout remain deferred by the
planning-only instruction.
See [Render pricing](https://render.com/pricing) and
[free-service limits](https://render.com/docs/free).

Proposed settings for a future implementation:

| Setting    | Proposal                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| Source     | Accepted `development` commit of `smaq777/Basira-Hackathon`                     |
| Runtime    | Node 24 and npm 11, matching repository engines and lockfile                    |
| Build      | `npm ci --include=dev && npm run build`                                         |
| Start      | `npm start`                                                                     |
| Bind       | `0.0.0.0`, using Render's `PORT`                                                |
| Readiness  | `/ready`, with separate `/health` liveness verification                         |
| Deployment | Manual; automatic deploys and pull-request previews off                         |
| Region     | Evaluate Frankfurt against the existing Neon endpoint                           |
| Foundation | Disabled during initial provisioning; activate only after bindings are verified |

These are proposed settings, not a service definition or deployment receipt.
Render documents [web services](https://render.com/docs/web-services),
[Blueprint configuration](https://render.com/docs/blueprint-spec) and
[runtime identity variables](https://render.com/docs/environment-variables).

## Implementation work required later

1. Add an explicit Render **hosted-demo-only** platform path. Preserve Railway's
   existing behavior and keep hosted research and production unavailable on
   Render. Reject unknown platforms and mismatched platform metadata; never fake
   Railway environment variables to bypass startup checks.
2. Bind activation to the actual Render web-service ID, non-preview status,
   repository, `development` branch and full accepted 40-character commit SHA.
   Require these to match the configured staging declarations. Require verified
   TLS for both report and corpus connections.
3. Add a disabled-by-default, single-service deployment template after those
   startup guards and their negative tests exist. Do not create a database or run
   migrations as part of the template or startup.
4. Configure existing report, worker and corpus credentials privately in the
   selected Render account. Railway-private database hostnames are not reachable
   from Render. If the report service lacks a supported verified external
   connection, stop and record that blocker; changing its database is separate
   work requiring its own migration and data-preservation plan. Never substitute
   the read-only corpus credential for a report or worker login.
5. Keep reviewer/publication capabilities restricted. Copying the existing
   `REVIEWER_CORPUS_ACCESS_MODE=authenticated` setting fails the current
   Railway-only staging guard; do not expand that access in a hosting change.
   If Clerk is enabled, configure the actual new HTTPS origin without weakening
   secure cookies or ownership checks.

The existing app starts its worker in the server process and serves built UI
assets. Its current hosted-demo guard requires Railway metadata, so the accepted
application cannot simply be deployed to Render with Foundation enabled today.

## Acceptance before any cutover

- Run targeted platform tests: valid Render staging; wrong service, repository,
  branch or SHA; missing metadata; pull-request preview; unverified TLS; research
  or production activation; Railway regression. Then run `npm run check` and
  validate the future deployment template against Render's official schema.
- Verify the actual deployed revision, HTTPS, `/health`, `/ready`, private
  database roles and the unchanged corpus pin. No database migration, source
  approval or corpus backfill is part of this move.
- Run the existing read-only corpus preflight, then a bounded, explicitly
  authorized live test set. Retain first failures and compare provider, MCP,
  database retrieval and report stages separately. Provider failure must not
  become a false-content judgment or fabricated reference.
- Verify partial quotations, supported and contradicted claims, irrelevant
  input, report reload and guest ownership; then rewrite generation, quotation,
  condition and negation preservation, cancellation and exact validated copying.
  See [submission acceptance](../operations/SUBMISSION_ACCEPTANCE.md).
  The current live runner is pinned to Railway; any Render target support needs
  an explicit validated origin rather than arbitrary URL input.
- Check memory, worker recovery and simultaneous requests under a small agreed
  model budget. A successful build or health response does not prove AI readiness.

## Rollout, rollback and unresolved decisions

Keep Railway available until the Render flow passes acceptance. Use synthetic
tests while both hosts run: shared worker leases do not prevent additional
database connections or provider spending. Render restarts discard transient
rewrite candidates; avoid deployment during generation/copy. A new hostname
creates a separate guest cookie, so previous guest reports are not automatically
accessible there. Do not promise seamless guest-session transfer.

Before provisioning, verify access to Ahmed's Render account, the $7/month budget
and Saleh-confirmed private connection availability. Before deployment, obtain acceptance of the application
changes and record the exact development merge SHA. Before switching the shared
demo link, retain the old URL and accepted deployment as the rollback target.
Stopping a billed service or changing database networking is an explicit later
operator action, not part of this plan. Record the provisioning date and the
one-month shutdown date when deployment is authorized, so the temporary service
does not silently become an ongoing hosting commitment. Neon remains unchanged
throughout.

The planning branch starts from development
`9838bc285065c7e6301baf5ae2800c85950f9d80`. Submission PRs #170, #171 and #173
remain separate; a future Render build must use the actual accepted integration
commit rather than assume those feature changes are already deployed.
