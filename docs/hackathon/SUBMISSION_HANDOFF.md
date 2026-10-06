# Submission readiness and Ahmed handoff

**Prepared 6 October 2026 for issue [#198](https://github.com/smaq777/Basira-Hackathon/issues/198).** This is an operational checklist, not a submission receipt, eligibility certificate or claim of winning.

## Links to give the committee

- Public repository: [smaq777/Basira-Hackathon](https://github.com/smaq777/Basira-Hackathon), default branch `development`.
- Running application: [Railway staging](https://api-staging-42bc.up.railway.app/). Guest analysis needs no team login or provider key.
- [Judge quickstart](JUDGE_QUICKSTART.md), [implemented architecture](../architecture/ARCHITECTURE.md), [provider/source registry](../api/PROVIDERS.md), [step-by-step credential setup](../operations/CREDENTIALS.md).
- [Software CI at the application checkpoint](https://github.com/smaq777/Basira-Hackathon/actions/runs/37506934672), [dated six-case acceptance](../evidence/2026-10-06-staging-1.14-acceptance.md), [latest rewrite/References/copy receipt](https://github.com/smaq777/Basira-Hackathon/issues/169#issuecomment-6022396451).

Do not supply an owner's report URL as a public demo: report ownership is browser/session-bound. Judges must create a fresh synthetic review in their own profile.

## Authoritative rules and deadline

Checked the [official site](https://islamicaich.org/) and [terms](https://islamicaich.org/terms) on 6 October, alongside the supplied **دليل المشارك**. Guide references below use its **printed** page numbers, not PDF indices. The guide is not bundled into this repository because redistribution permission has not been established.

The official website states **6 October 2026, 23:59 Riyadh (UTC+3)**. Use the organizer portal and preserve confirmation. For a genuine general portal outage, follow official reporting instructions with attempt evidence/entry number; email is not a normal submission alternative. Recheck current organizer announcements/portal for any operational change.

Terms distinguish registration/receipt from acceptance, constrain team/track changes, require third-party rights and prohibit real beneficiary conversations/personal data in submitted material/model-service tests. Each rights holder's consent matters. Technical accessibility does not settle rights or qualified source approval.

## Requirement-to-evidence checklist

| Requirement                                                 | Current evidence / gap                                                                                                     | Owner and next action                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Operational usable demo, not only a concept (guide 31–34)   | Guest RAG/result and useful rewrite/copy verified; public URL exists                                                       | Ahmed: final fresh-browser smoke and SHA/provider readiness; do not count outages as acceptance                              |
| Public permitted GitHub and operating docs (guide 32)       | Public repo, lockfile, tests, setup/architecture/key onboarding                                                            | Saleh: confirm deliverable link/commit in portal; Ahmed: retain final CI/deployment receipt                                  |
| Source/tool/license record (guide 32; terms 8–9)            | Provider registry and rights/intake records exist; research approvals and full edition/permission ledger remain incomplete | Saleh/content reviewer: sign off exact included works/rights; remove unlicensed material from deliverable, not weaken guards |
| Prior-project baseline and new work (terms 8; guide FAQ 43) | Pre-work log exists; current repo begins 4 October 10:09 Riyadh                                                            | Saleh: supply original pre-4 October snapshot/archive and dated provenance; initial imported commit is not sufficient alone  |
| Presentation PDF/PPT (guide 31)                             | Proposal assets exist locally, not verified as final implemented-system presentation                                       | Saleh: finalize deck with current demo/evidence/limits and remove personal data; do not label proposal as final              |
| Video no longer than two minutes (guide 33)                 | Final video/link not verified in this task                                                                                 | Saleh: record permitted public/synthetic scenario, check duration, link/access and actual release                            |
| Registered team/track and contribution rights               | Repo names do not prove portal membership/acceptance                                                                       | Saleh: confirm registered Track 4, team confirmations and rights declarations; no new team/project substitution              |
| Scholarly reliability / critical cases (guide 38)           | Six bounded software/semantic cases plus one useful rewrite; no broad qualified benchmark                                  | Content reviewer + Ahmed: critical-case review and declared threshold; preserve rejection/failure cases                      |
| Benefit and baseline comparison (guide 39–40)               | Editorial need/test cases documented; no measured beneficiary improvement established                                      | Saleh: present measured small experiment if available; otherwise explicitly label preliminary evidence                       |
| Operating cost, maintenance and dependencies (guide 40)     | Provider/role/budget/fallback documented; measured per-review cost/latency not complete                                    | Ahmed: record bounded observed latency/cost and owner budget; no invented estimates                                          |
| Private data/secrets and permitted assets                   | Synthetic public examples; policy checks; no new historical secret audit in this task                                      | Saleh: final permitted-assets/history/privacy review; do not publish contact rows, cookies, keys or private screenshots      |
| Submission via portal and confirmation (guide 33)           | No verified final submission receipt                                                                                       | Saleh: upload final files/links and retain confirmation before deadline                                                      |

No row marked incomplete can be inferred complete from CI or this README.

## Evaluation alignment: what our evidence does and does not prove

The supplied guide's **final-stage** rubric (printed 37–41) assigns:

| Criterion                            | Weight | Basirah evidence and improvement needed                                                                                                                              |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical solution and actual AI use | 25%    | Implemented structured extraction/relevance/assessment/rewrite/verifier, leased persistence; selected live tests. Maintain availability and reproduce first outcomes |
| Scholarly reliability and safety     | 15%    | Evidence/citation preservation, abstention/referral, qualified approval still pending. Software tests alone cannot prove scholarly safety                            |
| Innovation/value                     | 15%    | Distinguishes quotation fidelity from inference support; needs a declared comparison with a simpler baseline                                                         |
| Beneficiary experience/accessibility | 10%    | Arabic RTL and readable comparisons; no completed target-user/mobile accessibility study claimed                                                                     |
| Track-specific benefit               | 20%    | Editing use case and bounded examples; measure task success/time/unsupported inference detection against a baseline rather than claim universal accuracy             |
| Operating feasibility                | 10%    | Dependencies, owner budget, fallback, roles, runbooks; record observed cost/latency and maintenance responsibility                                                   |
| Presentation/verifiability           | 5%     | Public code, repeatable cases and linked receipts; final deck/video/portal files still owner actions                                                                 |

These are not estimated scores. The guide requires critical-case success and adequate ordinary-case performance for its reliability threshold; a small acceptance suite is not that complete independent assessment.

## Release identity and retained boundaries

- Last verified functional source: `51654b2e045a03b33b0809cadf6a316864512a04` (PR195).
- Railway deployment at that checkpoint: `24bcf66c-901f-4ad4-92be-f44224ccaa79`, SUCCESS, with actual/declared SHA match. Read live identity again before any later claim.
- Corpus pin: `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`; 175 passages/175 embeddings, 1536 dimensions. Reviewed overlay is separate.
- Semantic prompt/pipeline 1.14; OpenRouter primary and direct Gemini availability-only backup. Actual model/provider identity belongs in each receipt, not a generic provider claim.
- Fresh PR195 synthetic review: `f8b68840-a0b8-4257-b384-f7c2fea7f665`, three sources including two Tafsir works; validated candidate used two References. Unused evidence excluded; exact server/display/copy equality and unchanged original were verified.
- Capabilities remain `verification:false`: provisional, not scholarly approval. Dorar access, ambiguous references and limited corpus remain disclosed.
- The historical absent report `3c15330c-9d6d-42ea-ae5b-b390d0138480` was genuinely absent in the correct store; its exact historical deletion cause is still unproved. Do not manufacture a recovered report.
- Reviewer editing/source-overlay controls and email receipts have component/bounded evidence. Full owned expert publication → fresh subsequent retrieval → consented mailbox delivery is still a separate live acceptance task.
- No new corpus collection/embedding, shared migration/grant changes, production promotion or portal submission was performed by this documentation task.

## Two-minute video outline (not a recorded video)

| Time            | Show                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| 0–15 seconds    | Problem: an exact quotation can accompany an unsupported inference; Arabic editor audience            |
| 15–50 seconds   | Paste the public Quran 2:271 rough draft; compare exact quote/condition and actual attributed context |
| 50–80 seconds   | Show supported author assessment, useful verified rewrite and used numbered References; copy exactly  |
| 80–105 seconds  | A contradicted/insufficient-context result, no unrelated evidence; human review option                |
| 105–120 seconds | Repo/demo links, architecture boundaries and honest pending source approval/evaluation                |

Edit waiting time out clearly without implying instantaneous processing. Keep all personal/email/cookie/secret content out of the recording. A screenshot of a fixture is not proof of live retrieval.

## Prioritized to-dos before submission

The [component/rights ledger](../governance/SUBMISSION_COMPONENTS.md) records direct runtime licenses and unresolved content/asset permission checks. It is not a blanket rights approval.

1. **P0 — Saleh:** finish presentation and ≤2-minute video, confirm registered team/track/rights and original dated baseline, upload through portal, verify all public links and keep receipt.
2. **P0 — Ahmed:** verify exact running source/SHA guard, health/ready/capabilities and one fresh owned browser flow after final accepted merge. Freeze functional changes unless a concrete blocker appears; preserve first failures.
3. **P0 — Saleh + content reviewer:** settle the included-source/asset rights ledger and assess critical scholarly cases. If incomplete, disclose scope and restrict claims; do not assert approved or 100% accurate.
4. **P1 — Ahmed:** if reviewer functionality will be demonstrated, prove one synthetic corrected report, explicit rights-bearing contribution, relevant future retrieval and consented delivery end to end. Otherwise label that full chain not accepted and keep the demo on the verified guest flow.
5. **P1 — Team:** record practical cost/latency, small baseline comparison and known failures; evidence is more useful than extra untested features.
6. **After submission:** broader evaluation, mobile/accessibility refinements and production promotion under separate accepted issues.

## Copyable handoff to Ahmed / his agent

**OBJECTIVE:** Preserve the accepted Basirah staging result/rewrite experience and finish a truthful judge-verifiable submission. Saleh has spent the night refining the result design; please improve further only where evidence warrants it, without undoing the accepted comparison experience.

**CURRENT STATE:** Public repo/default development; functional checkpoint PR195/SHA51654b2; pinned175 corpus; prompt1.14; guest RAG plus useful verified rewrite/References/copy receipts. Documentation issue198 refreshes README, implemented architecture, actual providers/key onboarding and this checklist. Check its PR/CI/merge state before treating it as delivered.

**RELEVANT FILES:** README; docs/hackathon/JUDGE_QUICKSTART.md; this handoff; docs/architecture/ARCHITECTURE.md; docs/api/PROVIDERS.md; docs/operations/CREDENTIALS.md; SUBMISSION_CORPUS_ACTIVATION.md and SUBMISSION_ACCEPTANCE.md; actual semantic/rewrite source anchors linked in architecture.

**DECISIONS:** Railway staging is the submission link. Railway API staging is the only product URL; never offer or submit a Vercel link. Production promotion is deferred. Preserve merge history, existing service/environment/TLS/corpus/model guards and original reports. No ingestion/embedding/grants rerun. Availability backup cannot bypass semantic preservation. Reviewer evidence is an explicitly approved overlay, not mutation of frozen research baseline.

**KNOWN FAILURES/GAPS:** No final portal receipt/deck/video verification; pre-Oct4 provenance still requires original dated proof; qualified source/rights/evaluation gaps; complete expert contribution→future retrieval→consented delivery not yet accepted; historical report deletion cause unproved. Do not erase dated failed attempts.

**NEXT ACTION:** Read AGENTS/CONTRIBUTING, current issue198/169 receipts and working-tree state. Take only the remaining scoped P0/P1 items above. For any accepted merge triggering deployment, align the exact full deployment SHA with deploys skipped, use the existing scoped from-source operator procedure, then verify actual identity/health and fresh own-browser flow. Return sanitized evidence and remaining owners/actions, not a blanket readiness claim. Leave issue closure to owner acceptance.
