# Explicit hosted research staging boundary

Related to #69/#14/#20; stacked on the reviewed cleaning, delivery and capacity
work at `a84ec9c`. At the last public inspection, the Vercel capabilities request
returned 404 and Railway had owner migration 0014 ready with all AI flags off.
The existing research gate rejected every hosted bind or production-mode process.
Local loopback success therefore could not establish a connected shared UI.

The proposed profile permits an explicitly selected Railway staging service to
run the current source/model/RAG pipeline. It requires research opt-in, hosted
Secure-cookie mode, matching staging environment/service and declared accepted
development revision, plus verified report/corpus TLS. Conflicting platform Git
metadata rejects activation. Source declarations are operator configuration,
not cryptographic provenance. CLI uploads require an independently checked
deployment receipt; see [operator setup](../operations/HOSTED_RESEARCH_STAGING.md).

The default local profile and every feature's default-off state remain. Guest
ownership, retention, rate limits, document/review capacity, source policy,
original spans/hashes, citations and provisional source status are unchanged.
Staging workflow jobs now reject manual dispatch from another branch. Production
workflow and production Vercel configuration remain unchanged. There is no
migration, provider call, external data write, environment write or deployment
in this implementation.

Offline checks cover wrong/missing staging bindings, main source declarations,
conflicting platform Git metadata, relaxed TLS, default-off/local behavior and
the real server startup boundary before external dependencies. Hosted activation
still needs Saleh's acceptance and configuration, external read-only Python/index
assets, separate report/worker/Neon identities, compatible schema and a fresh
persisted report through the actual public UI. These tests do not prove that run,
source rights or religious correctness.

Required Node 24 / npm 11 repository checks passed: 52 test files / 708 tests,
typecheck, documentation links, bounded policy checks, formatting and build.
The two focused boundary/routing files passed 25 tests, including three actual
server-startup subprocess controls. The full build retains the existing bundle
size warning. External check output is retained in
`AI_Foundation/experiments/integration-lead-v1/HOSTED_PROFILE_CHECK_V1.log`.

Rollback disables Foundation or its individual providers. Existing reports and
source records remain intact; no historical SQL or checksums need replacement.

During implementation Saleh merged owner PR #97 (`f130560`), adding a read-only
hosted draft adapter. Its source and UI disclosures, no-Python bootstrap and
live MCP/web/cache/rewrite rejection are preserved in the integration merge.
The full research profile is a separate `hosted_research` runtime mode, and
selecting both profiles fails closed. The original 52-file / 708-test receipt
predates this merge. The combined source passed its own full check: 53 files /
719 tests, typecheck, docs/policy/format and build. Its receipt is
`AI_Foundation/experiments/integration-lead-v1/HOSTED_PROFILE_OWNER97_CHECK_V2.log`.
Additional controls preserve the accepted hosted-demo restrictions and reject
simultaneous demo/research selection. No hosted environment or provider was activated.
