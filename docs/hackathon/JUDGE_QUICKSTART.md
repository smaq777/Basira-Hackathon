# Judge quickstart

This path lets a reviewer reproduce exactly what the repository currently claims without receiving team credentials or private notes.

## 1. Verify the release identity

Record the repository URL, release tag, commit SHA, and release notes. Compare [current status](../STATUS.md) with the delivered tag. Planned architecture is not evidence of a working integration.

## 2. Run the credential-free checks

The committee can open [Railway staging](https://api-staging-42bc.up.railway.app/)
without a team account or API key. The current site creates real expiring guest
reviews with recorded Quran/source evidence and provisional model assessment.
Selected supported/contradicted, altered quotation and unavailable-evidence
cases were observed online. These are research results, not scholarly approval.
The [submission checkpoint](../evidence/2026-10-06-submission-blockers.md) records
the observed release and remaining corpus/rewrite deployment checks. Reviewer
publication and email acceptance remain deferred.

Install Node.js 24 LTS and npm 11, then run from the repository root:

```bash
npm ci
npm run check
npm run dev:api
```

In a second terminal, run `npm run dev:web`. Open `http://localhost:5173`.
With a configured migrated database, `/ready` returns `200`; guest document,
revision and review-run endpoints work. A credential-free checkout does not
enable the hosted evidence/model providers. The shared staging service has those
providers configured server-side; guests never supply provider credentials.

## 3. Configure only delivered integrations

Read the [credential and service onboarding guide](../operations/CREDENTIALS.md)
and [Foundation setup](../operations/SETUP.md). Live staging uses its existing
Neon reader, Tafsir MCP and OpenRouter configuration. Store credentials outside
Git and never send them to the committee. Do not enable optional providers merely
because their tool inventories are reachable.

## 4. Inspect evidence

- Product scope and exclusions: [requirements](../product/REQUIREMENTS.md)
- System call order and trust boundaries: [system blueprint](../architecture/SYSTEM_BLUEPRINT.md)
- Physical schema and query paths: [data model](../architecture/DATA_MODEL.md)
- Provider/source status: [provider registry](../api/PROVIDERS.md)
- Software and scientific gates: [test strategy](../testing/STRATEGY.md)
- Rights and attribution: [rights policy](../governance/RIGHTS.md)
- Baseline versus hackathon work: [evidence log](../evidence/2026-09-30.md), [provider/deployment record](../evidence/2026-10-02-provider-setup.md) and Git history

## 5. Interpret deployment evidence

A deployment is verified only when the exact commit SHA, environment, URL, UTC timestamp, smoke result, and rollback target are recorded. A workflow file, passing build, bot installation, preview editor, or loading page is not a verified deployment.

The intended route is issue branch → `development` → staging → accepted `development` to `main` pull request → manual production deployment. GitHub merge commits preserve the contribution and promotion history.

## 6. Security and privacy

No judge should need a team member's token, account password, local MCP configuration, conversation transcript, unpublished user post, or private dataset. Report any suspected credential privately and allow the owner to revoke it before public discussion.
