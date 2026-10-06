# Staging recovery and ticket-return evidence — 6 October 2026

Related to [169](https://github.com/smaq777/Basira-Hackathon/issues/169) and [184](https://github.com/smaq777/Basira-Hackathon/issues/184). Saleh authorized staging recovery, existing project-owned Gemini keys and bounded public/synthetic checks. Mobile, reviewer/publication/email acceptance, source collection, Neon mutation and production promotion remain deferred. The ticket confirmation return is the explicitly requested public-flow exception.

## Recovery boundary and source

- Exact Railway project `9837ef84-08f3-4228-b7ac-f3b3dc25fba0`, API service `4d15a8f1-0028-42d6-adfa-cef07e55a9bc`, staging environment `97179b92-48b1-412f-95ff-1901bb826458`.
- Configured source read-back: `smaq777/Basira-Hackathon`, `development`.
- PR182 and PR183 were already merged when inspected. Their merge commits are `3b42cccffa2849a97257afc92e3b3dce4903c1dd` and `0434cf45a5134fc592d3978ec5976fa6e533198e`; required quality/policy/dependency-audit checks were successful. This turn did not re-merge them.
- Prior deployment `dd140ada-ce48-4d69-8b4b-7b45f651583c` was CRASHED. The retained bounded startup log showed `HOSTED_DEMO_ENVIRONMENT_MISMATCH` at 14:35:10 UTC. The declaration still named `8c8cce0649a4571776147fcada1da54f1cfcd13b` while actual source was `0434cf45`. The earlier narrow log window returned no error; it does not establish the literal first crash timestamp.
- Changed the SHA declaration with deploys skipped, enabled existing Gemini backup, and temporarily enabled content-free rewrite diagnostics. No credentials were replaced, no limits or guards removed, and no data/roles/embeddings/ingestion changed.
- Configured-source redeploy `0e1c44ad-1fcf-454d-b61f-2cfcd9f63fc9` reached SUCCESS with exact source `0434cf45`. `/health`, `/ready`, `/api/v1/capabilities` returned HTTP 200; migration 0018; `verification:false` remains intentional provisional status.
- Gemini activation/key1/key2/primary-key-presence booleans were true. One bounded synthetic request returned Google `gemini-2.5-flash`, HTTP 200. OpenRouter remains primary. No shared failure was injected. Invalid output and semantic rejection did not trigger backup.

## Fresh first outcomes — full gate FAILED

Ran once under Node24: `node scripts/acceptance-submission-staging.mjs --live`. First receipt completed 14:53:37 UTC; local operator artifact `submission-acceptance-2026-10-06T14-51-03.418Z`. **2/6 passed.** Reports select corpus `7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f`, semantic prompt `evidence-support-v1.13`, pipeline `provisional-semantic-v1.13`. No corpus activation was repeated.

| Case                   | First review ID                        | Sources  | First outcome                                              |
| ---------------------- | -------------------------------------- | -------- | ---------------------------------------------------------- |
| supported-negation     | `46b6f7b8-a11b-4fb7-83c6-60834bfbdfab` | 3        | completed/supported; pass                                  |
| contradicted-negation  | `de7870f0-0483-49cc-a22f-c47378c0397e` | 3        | partial/invalid_citations; fail                            |
| supported-condition    | `f2e6f333-d77a-4c37-95ec-c9d477067339` | 3        | completed/supported; pass                                  |
| contradicted-condition | `50417c9a-b87e-4fe6-97fc-c6a7ac81f1de` | 4        | partial/invalid_response at primary relevance; fail        |
| unavailable-narration  | `ccc3a645-c394-4071-b78b-63b2ad80e3fc` | 0        | partial/invalid_citations; fail, not successful abstention |
| off-topic              | no review ID retained                  | unproved | API request timed out; fail, not empty-evidence acceptance |

Successful cases proved saved-report reload equality and anonymous HTTP401. Failed rows must not inherit those proofs: assertions stopped before reload/access tests. Manual Arabic inspection confirmed prohibition of excess in 7:31 and linked hiding/giving-to-poor conditions in 2:271. Quran 7:31 sources include live Moyassar and Saadi. Wedding candidate retrieval selected no unrelated sources, but its assessment validation still failed; zero sources alone cannot establish acceptance.

Actual trace identities: extraction OpenRouter `openai/gpt-6-luna` / OpenAI HTTP200. Primary relevance `openai/gpt-6.1-sol` / OpenAI timed out in four retained cases; direct `gemini-2.5-flash` / Google relevance and assessment returned HTTP200 afterward. The contradicted-condition primary returned HTTP200 with invalid response and was not retried through Gemini. Transport success did not bypass exact citation validation. The specific offending citation field cannot be recovered from response hashes alone; its cause remains unproved. Do not normalize/fabricate excerpts or broaden fallback to get a passing result.

## Fresh useful website author rewrite

Owned report `895e6814-a728-4fca-bab1-f439b49935ba` used:

> قال تعالى: «وإن تخفوها وتؤتوها الفقراء فهو خير لكم» [البقرة: 271]. لما نخفي الصدقة ونعطيها للفقراء فهذا خير للمتصدق.

It returned three relevant sources and a supported author claim. The first proposal exposed an actual author replacement:

> عندما نخفي الصدقة ونعطيها للفقراء، يكون ذلك خيرًا للمتصدق

The protected quotation stayed verbatim; hiding and giving to the poor remained linked; no `من إظهارها` comparison was imported. The existing server requires independent verification of meaning/conditions/negations/exceptions/scope/modality before validating an author replacement. No validation changed. UI comparison showed the replacement, not only citation insertion.

The copy action showed `نُسخ النص المقترح مع التوثيق.` only after its existing exact server/candidate text equality guard succeeded. Independently read clipboard equalled displayed text:330 UTF16 units, SHA256 `729eb37b47147f03b329d58ab87eb2af7d29703f4c9f5b96b6121581c52e908c`. Recorded Quran/Moyassar/Saadi attribution remained labelled research/unapproved. The first clipboard read was too early and returned the previous clipboard; the completed action was awaited before equality was recorded.

A separate immediate cancellation on the same report showed `أُلغي الاقتراح وبقي النص الأصلي كما هو.`; candidate heading and copy button counts were zero. Reload preserved the exact submitted original. This UI proof does not expose candidate IDs or rewrite provider identities: the public candidate contract does not return them, and no browser cookies/state or private provider payloads were extracted. No claim of broad generation reliability follows from one success.

## Ticket return and final release boundary

The issue184 change retains the existing successful contact confirmation for five seconds, announces the return, then sets `#/home` and fully reloads once. It does not sign out, clear session storage, delete a report/ticket or change the submitted text. Duplicate saving is disabled after success. Pending saves and contact/email failures never start the timer; leaving the page cancels it. The default helper is reused by sign-out routing without changing sign-out behavior.

Targeted web tests passed35/35; six new timer/navigation tests cover success timing, exactly-once return, duplicate-save prevention, both failure classes, pending save and unmount cleanup. Full Node24 check passed1043 tests/72 files, typecheck, documentation, policy, formatting and builds before this evidence reconciliation; final source CI and deployment receipt belong on issues169/184. An existing bundle-size warning remains non-fatal. Test mocks do not prove inbox receipt; full email/reviewer acceptance stays deferred.

## Remaining owner handoff

Ahmed should investigate retained Gemini citation validation failures and the primary relevance invalid response using controlled content-free diagnostics/replays, preserving source fidelity and all negative tests. Investigate the off-topic API timeout without resubmitting until an actual cause is isolated. Full submission readiness requires fresh authorized acceptance after the real cause is repaired, not repeated sampling. Saleh owns account/budget/deployment decisions. Restore rewrite diagnostics to default false on the final ticket-return release, align its full accepted merge SHA before redeploy, and retain the final deployment identity on issue169. Leave issue closure to owner acceptance.
