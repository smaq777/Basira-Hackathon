# Collaboration and delivery workflow

GitHub Issues are the operational source of truth. The project board visualizes those issues; documentation explains contracts and decisions. Do not create a separate spreadsheet tracker.

Open the [Basira Hackathon Delivery Board](https://github.com/users/smaq777/projects/14). Views are intended for delivery Kanban, backlog planning, testing/review, blocked dependencies and the milestone roadmap. Repository issue-search views are not a substitute for the draggable Projects board.

## Status policy

| Status      | Entry condition                                                   | Exit condition                           |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------- |
| Backlog     | Captured idea or requirement                                      | Scope, tests and dependencies understood |
| Ready       | Issue accepted for implementation and unblocked                   | Developer starts linked branch           |
| In Progress | Active implementation                                             | Reviewable change and initial checks     |
| Review      | PR ready for technical review                                     | Review feedback addressed                |
| Testing     | Implemented/review-ready, awaiting validation or owner acceptance | Owner accepts required evidence          |
| Done        | Owner accepted and applicable delivery gates complete             | Reopen if regression discovered          |
| Blocked     | Specific unresolved dependency or access issue                    | Blocker verified resolved                |

Move cards by dragging between columns. Do not move an issue to Done merely because code was generated, a test passed, or a PR was opened. The owner closes issues after acceptance. Milestones group M0 preparation, M1 working loop, M2 reliability/UX and M3 handoff.

## Merge policy

### Branch route

```text
GitHub Issue
  -> <actor>/<issue>-<slug> from development
     (actor: saleh, ahmed, or codex)
  -> pull request to development
  -> quality + policy + dependency-audit
  -> Saleh acceptance (and Saleh review for Ahmed-authored work)
  -> merge commit to development
  -> staging verification
  -> development-to-main release pull request
  -> owner acceptance + merge commit
  -> manual production deployment gate
```

`development` is the GitHub default and integration branch. `main` is production-only. The repository allows merge commits and disables squash, rebase and auto-merge so committee reviewers can see task and release history. Merged short-lived branches auto-delete. Never force-push a shared branch.

Desired protection for both long-lived branches: pull request required; resolved review conversations; required `quality`, `policy` and `dependency-audit` checks; no force pushes or branch deletion. A mandatory independent-approval count is intentionally not configured because Saleh is the sole acceptance and merge authority and must also be able to accept owner-authored pull requests. Merge commits mean required linear history must remain off. CODEOWNERS names only `smaq777`.

## Team ownership

| Person                  | Responsibility                                                                                     | Review route                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Saleh (`smaq777`)       | Product owner, final acceptance reviewer, CODEOWNER and sole merge authority                       | Records acceptance and performs every merge        |
| Ahmed (`AhmedAlbishri`) | Assigned API, MCP, RAG, retrieval, provider-adapter and related backend-integration implementation | Opens an issue-linked PR and requests Saleh review |

Ahmed is not a reviewer for Saleh-authored work. Assignment does not authorize Ahmed to merge, deploy production, expose credentials or approve religious claims. Scholarly/content approval remains separate from code ownership.

**Current limitation:** GitHub returns HTTP 403 with “Upgrade to GitHub Pro or make this repository public” for protection and ruleset APIs while the repository is private. Both `main` and `development` are therefore unprotected. This is not proof that the intended rules are active. Reapply [the desired protection configuration](branch-protection.json) and read back both branches after the plan or visibility changes.

The CI policy rejects ordinary feature pull requests to `main`, requires feature pull requests to target `development`, and recognizes only `development` to `main` as a release promotion. This check is useful evidence but cannot technically prevent a direct push while branch protection is unavailable.

## Bots and access

- **GitHub Actions:** run deterministic checks with read-only default permissions; no provider secrets required.
- **Dependabot:** weekly dependency update PRs; no automatic merge.
- **Copilot review:** the dynamic Copilot workflow is active and completed successfully on PR #30. Repository-wide automatic review requires a branch ruleset, which is unavailable under the same current private-repository entitlement. Request Copilot manually on each pull request until that ruleset can be created. Advice is supplementary, not independent scholarly/human approval.
- **Vercel bot:** only becomes available for this repository after a verified Vercel/GitHub project connection. A bot installed on a different repository does not prove Basirah is connected.
- **GitHub MCP:** the observed connector installation used selected repositories and could not read Basirah, while the authenticated CLI could. Add the repository to the connector's permitted selection if needed; do not confuse this scope issue with Pro entitlement.

## Required issue record

Scope; acceptance checklist; planned tests; dependencies; risk; rollback/forward-fix; priority, area, type and phase labels; milestone. Keep titles/descriptions in English, retaining Arabic Islamic examples where needed.

After implementation, record changed paths, test commands/results, remaining QA and PR URL. No automatic owner acceptance or final-submission claims.

## Deployment gates

GitHub environments `staging` and `production` exist. Staging accepts only `development`; production accepts only `main`. Repository variables `DEPLOY_STAGING_ENABLED`, `DEPLOY_PRODUCTION_ENABLED`, `DEPLOY_RAILWAY_ENABLED`, and `DEPLOY_VERCEL_ENABLED` default to `false`. Provider credentials belong in environment secrets, never the repository.

The production workflow is manual, requires the `main` ref and an explicit `DEPLOY` confirmation, and remains disabled until the owner has accepted staging evidence. Environment branch policy is configured; required reviewers are not available under the current private-repository entitlement and must not be claimed.
