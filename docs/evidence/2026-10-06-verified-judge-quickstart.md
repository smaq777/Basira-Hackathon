# Verified Judge Quickstart evidence — 6 October 2026

Related to [#27](https://github.com/smaq777/Basira-Hackathon/issues/27), [#165](https://github.com/smaq777/Basira-Hackathon/issues/165), [#169](https://github.com/smaq777/Basira-Hackathon/issues/169) and [#176](https://github.com/smaq777/Basira-Hackathon/issues/176). This page supports the [Judge Quickstart](../hackathon/JUDGE_QUICKSTART.md), without publishing guest cookies, provider credentials, private drafts or raw model payloads.

**Last evidence reconciliation: 6 October 2026, 14:21:55 UTC / 17:21:55 Riyadh.** This timestamp marks receipt reconciliation, not a new health probe. The post-PR179 deployment failed; current working-release acceptance is pending. Saleh's restored source `30e25db7f08dbd6dc7655f706ff81e7d9f16ade5` remains the latest recorded accepted live release, not proof of current availability. GitHub repository read-back confirms public visibility (`private:false`).

## Latest deployment status: readiness gate failed

GitHub deployment `6886068041`, source `cb8e8e068418386f48b6fe426f4e72ed180d0949`, recorded success at 14:03:59 UTC then failure at 14:04:08 UTC. `/health`, `/ready` and `/api/v1/capabilities` each timed out after 12 seconds. The [owner restoration handoff](https://github.com/smaq777/Basira-Hackathon/issues/169#issuecomment-6018113908) preserves these first outcomes. Startup logs were unavailable to this audit; the current failure cause is unproved. The older SHA-declaration mismatch was confirmed on an earlier outage and must not be assumed to explain this one.

Require a dated actual deployment/SHA receipt and HTTP 200 readiness before running live judge examples. Gemini activation and fresh complete-flow acceptance on the merged release remain pending.

## Accepted restored staging

Saleh's [owner restoration and acceptance receipt](https://github.com/smaq777/Basira-Hackathon/issues/169#issuecomment-6016275005), posted 12:30:18 UTC, records:

- Railway final diagnostics-off deployment `74bd2932-40fb-4af3-ace4-5f23344c7a06`, source 30e25db, branch `development`, status SUCCESS.
- `/health`, `/ready` and capabilities HTTP 200; migration 0018; `verification:false`.
- Corpus `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`,175 passages; semantic `evidence-support-v1.13` / `provisional-semantic-v1.13`.
- Fresh six-case acceptance 6/6; saved-report reload equality and anonymous 401. The corrected gate rejects unavailable 403 outcomes instead of counting empty evidence as success.
- No ingestion, grants, source approval, production promotion or scholarly approval.

| Exact runner case      | Fresh report ID                        | Recorded outcome                         |
| ---------------------- | -------------------------------------- | ---------------------------------------- |
| supported-negation     | `47f74b20-a1bd-4678-946e-720bf0d565b4` | supported;3 sources                      |
| contradicted-negation  | `7cdcf567-2970-4837-b09d-d9f7d3713737` | contradicted;3 sources                   |
| supported-condition    | `28dfd655-b6d9-4e34-9f37-3db11f450bc7` | supported;3 sources                      |
| contradicted-condition | `beef2eb5-0850-4a55-a0a4-d5d9d841ed9b` | contradicted;4 sources                   |
| unavailable-narration  | `965a4836-cc99-4af8-aa51-26f7941a3b0c` | insufficient_context;0 sources/citations |
| off-topic              | `f69541ab-40f3-4f4f-b6f5-e43740cadb75` | completed/not_applicable;0 sources       |

Inputs and expectations are in the [acceptance runner](../../scripts/acceptance-submission-staging.mjs). Retained operator receipt: `submission-acceptance-2026-10-06T12-18-28.675Z`; SHA256 `6d297828252407ebdf91ef6dc45096d6d6facf293ec3cb81c2cee5bb4e279202`. Guest-owned report IDs document identity, not public access.

Manual review confirmed material conditions/negations and abstention on these selected cases. One supported-condition field contained mixed-language wording, `الم supplied`; do not convert this small acceptance set into a claim of polished general Arabic accuracy.

## Rewrite and copy: retain failure alongside success

On charity review `c942051d-c717-497f-ad6b-f96797035300`, the **first** rewrite was withheld as `invalid_candidate`; original unchanged, no copy. Diagnostics were off, so the rejection stage is unknown.

A distinct controlled candidate `92e90cec-a545-4634-ab8a-4c27137d1e25` passed generation, preservation and independent verification. The author replacement changed `خير للمتصدق` to `أفضل للمتصدق`, preserving the protected quotation and hiding/poor-recipient conditions, with exact recorded Muyassar attribution and pending research status. Server copy POST200, displayed text and clipboard matched 176 UTF16 units; SHA256 `28fa3c82a4572676a485ce2bb5726df30e466795e143c67d22e596d49172f34c`.

Cancellation review `c285117d-413d-420d-acb6-9697bda7631e`, candidate `db94128f-21ea-4ae9-97ab-0e4ccf00b7c7`: pending→cancelled; text/operations null; copy 409 `REWRITE_NOT_VALIDATED`; original reload unchanged. Diagnostics were returned to false afterward. Transient rewrite candidates are not durable report updates and can disappear on restart.

This proves one controlled useful author rewrite/copy and cancellation control. It does not explain the retained first rejection or prove 100% generation reliability.

At 14:09 UTC, a separate local first charity rewrite used public evidence frozen from a 175-corpus report. Both OpenRouter Luna generation and verification calls returned HTTP 200. The proposal added `من إظهارها`, a comparison target absent from the original author claim. The verifier returned `evidenceSupported:true`, but `meaningPreserved:false` and `scopePreserved:false`; the result was withheld at `verification_validation` / `meaning_changed`, with no copy.

Exact captured-packet and minimized deterministic replays reproduce this rejection. This explains this newly captured failure, not Saleh's historical failures with diagnostics off. The generation-only `author-original-scope-v1` policy is implemented in [PR182](https://github.com/smaq777/Basira-Hackathon/pull/182), with merge and deployment pending. The independent verifier and all preservation/copy gates remain unchanged. Rejected meaning/scope output does not authorize a Gemini retry. No fresh Railway review or database retrieval was performed by this local control.

Retained operator receipt: `author-first-2026-10-06T14-09-34-475Z/trace.json`, SHA256 `4ea711439dbf7687e5e936afe56958c03b0fbae7c0709a3c32dba5b52188b24b`; companion first and minimized replays remain local. Only the bounded outcome and receipt identity are published here.

## Pending generation policy: safe skips and an actual author improvement

Two distinct changed-protocol controls on already-clear charity and 7:31 drafts received real OpenRouter Luna HTTP 200 and passed validation/exact copy as attribution-only results. These are safe skips of unnecessary author changes, not author improvements.

A rough public author span, `لما نخفي الصدقة ونعطيها للفقراء فهذا خير للمتصدق`, was actually rewritten as `إخفاء الصدقة وإعطاؤها للفقراء خيرٌ للمتصدّق.` Semantic assessment completed as supported; actual OpenRouter verification, protected quotation, poor-recipient condition, no added comparison target and exact-copy checks passed.

This semantic control also exercised a real transport recovery: OpenRouter Sol relevance timed out after 6.684 seconds; direct Gemini relevance and assessment then returned HTTP 200. No failure was injected, and the trace retains the actual failed primary and successful Google model/provider identities. All these controls used frozen public sources, not fresh RAG or Railway. They do not establish deployment or general rewrite reliability.

Retained receipt: `colloquial-policy-2026-10-06T14-19-35-203Z/receipt.json`, SHA256 `70cf710f60797a175255b119ba08aa92608f88d92c2de661ce18dd3093d0ddd4`. The [PR182 generation policy](https://github.com/smaq777/Basira-Hackathon/pull/182) remains pending merge and deployment; unchanged validation continues to withhold altered meaning/scope.

## Later code and direct Gemini evidence

[PR181](https://github.com/smaq777/Basira-Hackathon/pull/181) merged 13:39:14 UTC as `8c8cce0649a4571776147fcada1da54f1cfcd13b`, adding sticky result navigation. [PR179](https://github.com/smaq777/Basira-Hackathon/pull/179) merged 14:02:46 UTC as `cb8e8e068418386f48b6fe426f4e72ed180d0949`, adding the default-off direct Gemini backup. Required CI was green. These merges are not evidence that either change is deployed or activated.

PR179 records two bounded local real-provider controls: five Google HTTP 200 stages on a synthetic rights-preservation fixture and five on the public Quran 2:271 charity draft with frozen Quran/Muyassar/Saadi evidence. Supported assessment, useful author replacement, protected conditions/quotation and exact-copy checks passed. Public receipt SHA256 `d498985d39d4cb6f81705083a4e32535f06ff78d349c3007a4e9daf04a796b82`.

In those PR179 controls, OpenRouter 403 was injected locally to exercise the backup; no actual shared outage or fresh DB retrieval was performed. The first schema 400 failure was retained before a distinct repaired-protocol run. Real generation used the first Google key; second-key transport failures were tested offline. This verifies the direct transport on frozen packets, not Railway activation, uptime or scholarly accuracy. Later deployment and fresh complete-flow evidence must record the actual accepted SHA, UTC time and first outcomes.

## Limits that must remain visible

- Research sources have pending approvals. Technical transport, source matching and generated findings are separate from scholarly approval and hadith grading.
- The Tawhid draft with a blank ayah number yields no explicit locator. Independent canonical controls match the same excerpt to both 31:25 and 39:38; no unique reference or automatic correction is justified. The quoted Muadh wording remained unresolved. Historical extraction 403 occurred before per-claim RAG, so it did not prove database failure.
- Mobile, reviewer/publication/email and presentation work remain deferred. Repository visibility is public; final portal receipt and production release acceptance are separate.
- Impact timing/error reduction is unmeasured. Optional editor exercises must report sample sizes, task order, raw outcomes and failure/abstention handling before drawing conclusions.
