# Contributing to Basirah

## Before changing files

1. Read [status](docs/STATUS.md), [requirements](docs/product/REQUIREMENTS.md) and the relevant architecture document.
2. Confirm a GitHub Issue with scope, acceptance criteria, tests, dependencies, risk and rollback/forward-fix. Audit and documentation work also use issues.
3. Inspect `git status --short --branch`; preserve changes you did not create.
4. Update local `development`, then create a short-lived issue branch: `saleh/<issue>-<slug>` for Saleh, `ahmed/<issue>-<slug>` for Ahmed, or `codex/<issue>-<slug>` for a Codex-managed change.

`development` is the integration branch. `main` is production-only and receives reviewed promotion pull requests from `development`. GitHub currently denies protection requests for this private repository, so do not treat configured CI or written policy as enforced branch protection. Direct pushes remain technically possible until the rules can be written and read back.

## Development and validation

Use Node 24 and npm 11. Run `npm ci`, then `npm run check`. See [setup](docs/operations/SETUP.md). Keep third-party APIs out of default tests. Use synthetic fixtures, deterministic tests and clear labels for future scientific evaluation.

Change documentation with implementation. English is the documentation language; Arabic is appropriate for Islamic terms, source text and UI. Read the [glossary](docs/product/GLOSSARY.md). Do not turn an uncertain source match into a religious authenticity judgment.

## Two-developer collaboration

- One issue and short-lived branch per bounded task. Agree on shared files and API contracts before parallel changes.
- Publish draft PRs early. Use small commits; do not bundle unrelated formatting.
- Open feature pull requests against `development`. Synchronize your branch with `development`, resolve conflicts on the task branch, and rerun checks. Never resolve a conflict by blindly choosing all of one side.
- Promote an accepted release with a dedicated `development` to `main` pull request. Do not push feature branches or arbitrary commits directly to `main`.
- Regenerate `package-lock.json` with npm after resolving dependency changes; do not hand-edit dependency integrity records.
- Never force-push a shared branch. If history rewriting is genuinely needed, coordinate with the owner first.
- Database changes require checked-in migrations, isolated preview testing and an explicit rollback or forward-fix. No direct schema pushes to shared databases.

## Review and acceptance

PRs must link their issue, explain changed paths, attach test evidence, state remaining QA and record risks. Required target checks are `quality`, `policy`, and `dependency-audit`. A bot review is supplementary; it does not replace human acceptance or scholarly review.

The confirmed collaborators are `smaq777` and `AhmedAlbishri`. Saleh (`smaq777`) is the sole acceptance reviewer, CODEOWNER and merge authority. Ahmed implements assigned API, MCP, RAG and related backend-integration issues; his pull requests request Saleh's review. Do not request Ahmed to review Saleh-authored pull requests.

Saleh may merge an owner-authored pull request after the required checks pass and he records acceptance. Ahmed-authored changes require Saleh's approval. Automated review is supplementary and scholarly/content review remains a separate evidence requirement. Use GitHub merge commits so the committee can inspect branch history; do not squash or rebase-merge. Delete the short-lived branch after merging. Deployment and release require their own evidence.

Do not use automatic issue-closing keywords before acceptance. See the [team workflow](docs/governance/WORKFLOW.md).
