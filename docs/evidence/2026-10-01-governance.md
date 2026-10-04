# Repository governance evidence — 1 October 2026

This is a sanitized engineering record for issue [#31](https://github.com/smaq777/basirah/issues/31). It contains no credential values, team conversations, personal notes, local paths or private provider output.

## GitHub settings verified

- Repository remains private; no public release was performed.
- `development` was created from `main` at `a46e51e` and became the default/integration branch.
- `main` remains the production branch.
- Merge commits are enabled. Squash, rebase and auto-merge are disabled. Merged task branches auto-delete.
- Open Dependabot pull requests #26, #27 and #28 were retargeted from `main` to `development`.
- GitHub collaborator read-back confirmed `AhmedAlbishri` has write access; CODEOWNERS now names `smaq777` and `AhmedAlbishri`.
- GitHub environments `staging` and `production` were created. Staging accepts only `development`; production accepts only `main`.
- Repository deployment variables were created with `false` values for staging, production, Railway and Vercel gates.

## Enforcement limitation

Both branch-protection write attempts returned HTTP 403 with GitHub's requirement to upgrade or make the private repository public. API read-back confirms neither branch is protected. CI branch routing and documented policy are not represented as equivalent technical enforcement.

## Provider status

Vercel authorization was initiated but no Basirah project, GitHub connection, preview check or deployment was called verified at the time of this record. Railway and Neon remain unconnected. Deployment flags remain off and no service credential was added to the repository.

## Checked-in controls prepared

- Judge quickstart and official credential-onboarding guide.
- Development/main branch route and merge-history policy.
- CI routing checks for feature and release pull requests.
- Safe-off staging and manual production workflows.
- Expanded ignored sensitive paths and bounded credential-pattern checks.

## Local validation

- Node 24.21.0: `npm run check` passed, including TypeScript, 32 tests, documentation links, policy checks, formatting and production build.
- Actionlint 1.7.12 reported no GitHub Actions syntax or semantic errors.
- Gitleaks 8.30.1 archive checksum matched the official release checksum.
- Gitleaks scanned 11 commits (about 641 KB) and reported no leak. A separate working-directory scan (about 489 KB) also reported no leak.

The scan is evidence for the checked refs and working tree at this time, not a guarantee against a future credential commit. Commit, pull request and any verified provider connection are appended to issue #31 after execution.
