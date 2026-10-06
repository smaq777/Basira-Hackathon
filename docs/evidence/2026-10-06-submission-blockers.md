# Submission blocker fixes and live limits — 6 October 2026

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157)
and [issue #8](https://github.com/smaq777/Basira-Hackathon/issues/8).
Reviewer/publication/email work is deferred. The accepted result-page design
is preserved; this change addresses corpus activation, semantic acceptance and
faithful quotation-only rewrite reliability.

## Observed live release before the fix

At the morning audit, development and GitHub's successful Railway deployment
receipt selected `156e539e8df8c2b95861a652a839f8e7f7fa9126`.
The staging URL, `/health` and `/ready` returned HTTP 200. Readiness reported
migration `0018_email_delivery_receipts` and `verification=false`; the site
offers provisional evidence assessment, not verified scholarly readiness.

Seven first synthetic reports completed in approximately 5–16 seconds:
altered/faithful Quran excerpts, supported/contradicted claims, unavailable
hadith, unrelated writing and a 2,285-character draft. Every report retained the
old 86-passage corpus hash. Semantic prompt/pipeline **1.11** was already active.
Supported-author generation and exact server copy succeeded in one further
case; a faithful quotation-only UI attempt failed validation and withheld output.
Anonymous requests, wrong input hashes and altered-quotation rewriting were
denied; browser cancellation returned to the ready state.

Tafsir MCP 1.27.1 initialized with protocol 2025-03-26, matched both pinned
tool-schema hashes, and returned actual fetch/search results without RPC/tool
errors. Quran.com returned canonical 2:271 using the application's headers.
Fresh traces contained successful OpenRouter extraction/relevance/assessment
requests. Optional Hadith/Quran.ai tool inventories were reachable but are not
enabled application providers. These observations establish selected requests,
not future provider uptime.

Raw public synthetic reports, MCP responses, GitHub deployment receipts and UI
captures remain outside Git in the owning Foundation experiment directory,
`submission-audit-2026-10-06`. Initial logger/session-header/idempotency-key
harness failures remain recorded there; they are not application successes.

## Corpus preflight and changes

The new read-only `scripts/verify-submission-corpus.ts` ran at
**2026-10-06T09:07:12.516Z** through the existing least-privileged reader with
certificate/hostname verification:

| Check                   | Actual result                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Submission snapshot     | `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`, 175 passages / 175 embeddings                   |
| Historical snapshot     | `794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`, 86 passages / 86 embeddings                     |
| Embedding space         | `openai/text-embedding-3-small`, 1536 dimensions, 175 `search_document` rows covering 175 distinct selected members |
| Family restoration      | `tanzil-uthmani-v1.1:16:91` and `kfgqpc-muyassar-v3:16:91:tafsir`                                                   |
| Writes / provider calls | 0 / 0                                                                                                               |

Synthetic boundary tests cover verified corpus-only TLS, database/endpoint/role
mismatch and missing credentials. The deployment runbook corrects the old
`SOURCE_CORPUS_VERSION` typo to actual `FOUNDATION_CORPUS_VERSION`, includes the
optional `CORPUS_VERSION` startup declaration and retains the accepted-SHA gate.
No runtime configuration, schema, roles, source approvals or production data were
changed. Railway access belongs to Saleh; this workspace's CLI is unauthenticated
and Ahmed's browser workspace lacks the project.

The integrated [rewrite evidence](2026-10-06-rewrite-attribution.md) records the
fix, real retained-report replay and failure controls. The
[semantic acceptance evidence](2026-10-06-submission-semantic-acceptance.md)
records version compatibility and the bounded fresh-report check. Neither
offline replay nor a green suite establishes deployment of this branch.

Final integrated validation used Node **24.19.0**, npm **11.21.0** and an
exact-lock offline `npm ci` (209 packages, zero reported vulnerabilities).
`npm run check` passed: **64 files / 892 tests**, TypeScript, documentation
links, policy, formatting and API/web builds. This includes 17 corpus-preflight
boundary/coverage tests and 14 acceptance-harness tests. The initial sandboxed
suite could not spawn Vitest workers (`EPERM`); the normal check passed outside
that sandbox. Logs remain under the external audit directory as
`combined-npm11-ci.log` and `combined-check-final.log`. The existing large web
chunk advisory and npm's esbuild install-script advisory remain; builds passed
without changing either policy or the lockfile.

## Owner completion

Saleh's remaining activation is assigned in [issue #162](https://github.com/smaq777/Basira-Hackathon/issues/162).
Saleh must accept the PR, activate the snapshot/deployment declarations in his
Railway account and perform the [activation checks](../operations/SUBMISSION_CORPUS_ACTIVATION.md).
Fresh corpus/semantic/rewrite UI receipts remain required. Source collection and
new features are frozen; reviewer publication, email, production promotion,
source approval and general accuracy claims are outside this change.
