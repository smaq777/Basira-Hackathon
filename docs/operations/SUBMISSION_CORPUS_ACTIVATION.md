# Saleh's staging submission activation

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157)
and [corpus issue #8](https://github.com/smaq777/Basira-Hackathon/issues/8).
Owner activation is tracked in [issue #162](https://github.com/smaq777/Basira-Hackathon/issues/162).
Railway belongs to Saleh's account. Ahmed's workspace has no access to this
project; the changes below are an owner handoff, not a completed activation.
Use only the existing **staging** API service:

| Resource                   | Exact target                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| Railway project            | `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`                             |
| API service                | `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`                             |
| Staging environment        | `97179b92-48b1-412f-95ff-1901bb826458`                             |
| Public URL                 | <https://api-staging-42bc.up.railway.app/>                         |
| Existing Neon endpoint     | `ep-fancy-base-b2o8zdbw` (pooled or direct)                        |
| Research database / reader | `basirah_research` / `basirah_corpus_reader`                       |
| Submission snapshot        | `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f` |
| Historical snapshot        | `794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff` |

The submission snapshot already contains 175 passages and 175 embeddings in
`openai/text-embedding-3-small`, 1536 dimensions. No migration, new branch,
backfill, source approval or credential rotation is needed for this switch.
Keep the hosted-demo profile, existing report/worker database identities,
provider flags and corpus TLS settings. Sources remain pending research material.

## Read-only preflight

From the accepted checkout, using Node 24 and the existing corpus reader in the
operator's environment, run:

```sh
npx --no-install tsx scripts/verify-submission-corpus.ts
```

The script accepts only the target reader/database/endpoint with verified TLS.
It checks 175/175, historical 86/86, the embedding space, and Quran 16:91 with
its Muyassar child. Output contains counts and snapshot keys, never credentials.
It makes zero writes and zero model calls. `FOUNDATION_CORPUS_CA_CERT` is the
optional corpus CA; do not substitute the report database's CA. Do not print
Railway's raw variable list or copy credentials into issues, logs or this repo.

## Deploy the accepted development commit

1. Accept the submission fix PR with a merge commit into `development`.
   Fetch that branch and record its full 40-character merge SHA. Check CI on
   that SHA. A feature-branch SHA is not the deployed development merge SHA.
2. In Saleh's authenticated Railway project, confirm the service source is
   `smaq777/Basira-Hackathon`, branch `development`, environment `staging`.
   Set `FOUNDATION_CORPUS_VERSION` to the submission snapshot. The previous
   ingestion handoff's `SOURCE_CORPUS_VERSION` name was incorrect for this API.
   If an explicit `CORPUS_VERSION` exists, update it to the same snapshot:
   startup rejects conflicting corpus declarations.
3. Set `BASIRAH_DEPLOYMENT_SHA` to the recorded accepted merge SHA. Preserve
   `BASIRAH_DEPLOYMENT_REF=refs/heads/development`,
   `BASIRAH_DEPLOYMENT_ENVIRONMENT=staging`, and the existing service-ID gate.
   Do not disable the SHA guard to make a deployment start.
4. Deploy the accepted source. If Railway already auto-deployed the merge
   before the declaration update, a guard failure is not acceptance; redeploy
   from the configured source after updating the declarations. Confirm no
   newer development commit appeared, and compare the resulting Railway Git
   SHA/service/environment with the recorded accepted SHA.

The official CLI supports explicitly scoped commands below. Replace the SHA
placeholder with the actual accepted merge SHA; run under **Saleh's** account:

```sh
railway variable set --project 9837ef84-08f3-4228-b7ac-f3b3dc25fba0 --service 4d15a8f1-0028-42d6-adfa-cef07e55a9bc --environment 97179b92-48b1-412f-95ff-1901bb826458 --skip-deploys FOUNDATION_CORPUS_VERSION=7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f BASIRAH_DEPLOYMENT_SHA=<ACCEPTED_DEVELOPMENT_MERGE_SHA>
# Only when CORPUS_VERSION is explicitly configured:
railway variable set --project 9837ef84-08f3-4228-b7ac-f3b3dc25fba0 --service 4d15a8f1-0028-42d6-adfa-cef07e55a9bc --environment 97179b92-48b1-412f-95ff-1901bb826458 --skip-deploys CORPUS_VERSION=7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f
railway redeploy --project 9837ef84-08f3-4228-b7ac-f3b3dc25fba0 --service 4d15a8f1-0028-42d6-adfa-cef07e55a9bc --environment 97179b92-48b1-412f-95ff-1901bb826458 --from-source --yes
```

Without `--from-source`, `redeploy` reuses the latest deployment artifact and
does not necessarily deploy the accepted code. CLI options were checked against
the installed official Railway CLI help. The dashboard is also suitable if it
preserves the same exact targets and source receipt.

## Acceptance and rollback

Verify `/health`, `/ready`, and capabilities, then run the bounded
[semantic acceptance](SUBMISSION_ACCEPTANCE.md). Inspect fresh reports for the
submission corpus and `evidence-support-v1.11` / `provisional-semantic-v1.11`.
Old saved reports intentionally retain their old corpus/version.

In the actual staging UI, submit a faithful Quran-only excerpt, generate its
recorded attribution and verify exact copy. Repeat supported-author wording
with a material condition, checking preserved quotation/condition/negation and
fresh server copy. Check cancellation and altered/unsupported withholding.
Retain first failures and receipts; successful unit tests do not establish these
fresh online outcomes. Controlled provider failure remains an offline test.
Reviewer/publication/email acceptance is deferred by the user's instruction.

Rollback the corpus selection to the historical hash (and matching explicit
`CORPUS_VERSION`, if set), preserving the source SHA declaration, and redeploy.
For rewrite trouble, disable the staging rewrite flag or revert the accepted
rewrite commit through the normal PR process. Preserve both snapshots and saved
reports. Production and `main` are outside this handoff.
