# Mixed writing: first UI outcomes and independent delivery audit

Related to #11, #8, #13, #18 and #38. Two public author-plus-Ayah texts were
submitted once each through the Basira-Hackathon UI. Frozen source
`b99e91056211e0c7cbcd1b793a9051482d934e8f` predates subsequent owner merges;
this is local delivery evidence, not shared deployment or general accuracy proof.

## Frozen configuration and retained failures

Authoritative protocol V4 uses `http://basirah-selection.localhost:8776`, with a
separate loopback PostgreSQL 18 report database `basirah_selection_ui_v1` on
55441, complete owner schema 0014 and distinct runtime/worker logins. The hostname
isolates cookies from existing localhost/127.0.0.1 sessions; no session reset or
quota increase occurred. The corrected Neon cleaning child was read-only, with
the same pinned 86-passage corpus and first-repeat cleaned views. Tafsir live,
web discovery, rewriting, tickets and mail were disabled. Public text/model use
was explicitly authorized; credentials remain outside Git.

V1 failed before startup because Windows absolute module imports require a file
URL. V2 reached the existing quota-limited database; the lead stopped before
submission. V3 was prepared but not launched after a cookie-isolation concern.
All receipts remain. Only V4 produced the two model/UI runs. The report-readback
helper initially used the wrong saved-UI property name, asserted before writing
reports, then used the recorded originalText/original keys; no model rerun occurred.

## First outcomes

| Case | Author text / distinction                                                           | Report                                 | Outcome                                                                            |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| ONE  | Colloquial wording beginning «الوالدين اذا امروا بمعصية» followed by a partial Ayah | `dbda4fe8-a94d-4dcb-91c9-8902f05b118d` | One exact author claim; provisional supported relation; 10 sources; 14.110 seconds |
| TWO  | Formal wording beginning «إذا أمر الوالدان بمعصية» and locator `[لقمان: 31:15]`     | `0dd482fd-6116-49a6-811e-bdc394ad1f4f` | One exact author claim; provisional supported relation; 11 sources; 12.868 seconds |

Both assessments cited an exact Muyassar 31:15 excerpt supporting non-obedience
in sin and continued companionship in what involves no sin. Each first extraction
accepted one alias-bound selection with zero rejected bindings. Both semantic
assessments completed; overall runs remained partial. The partial Ayah was
matched separately from its extent. A supported relation is a model finding,
not source rights, scholarly approval or a measured general success rate.

Independent readback recomputed original and all delivered passage hashes,
verified original UTF16 author offsets, retained first-repeat content-selection
identities, and located each citation inside an actually assessed passage.
Cases ONE/TWO delivered 16/17 passages, including six exact cleaned windows each.
Assessment inputs remained 12,503/13,151 tokens, so relevance and compaction still
need a separate frozen experiment.

Actual provider ledger: two Luna extraction calls, two Sol assessment calls and
four query-embedding calls; eight HTTP200 outcomes, zero fallback/provider
failures and zero reruns. Recorded total cost: USD0.069974555. These Sol
assessments used configured low effort, not a stronger-thinking experiment.

## Findings that change implementation priority

1. **Bibliographic locator detection (#11):** TWO treated `لقمان:` as an additional
   unresolved quotation, selected it for comparison, and made the faithful Ayah
   harder to find. Parse a complete bracketed reference as attribution metadata,
   preserving original offsets; keep real quotations separately reviewable.
2. **Plain Arabic and qualifiers (#13/#18):** ONE explanation contains
   `الم supplied`; its scope phrase omits the negation present in the claim,
   conditions and negations fields. TWO is clearer. Do not silently rewrite
   immutable citations or force a supported relation while improving explanations.
3. **Specific partial-result copy (#18):** Both results show generic insufficient
   reliable-source escalation despite their provisionally supported claim, and
   offer a ticket action while tickets are disabled. Explain the actual unresolved
   component and honor capabilities; do not imply source insufficiency solely
   from partial quotation/attribution coverage.
4. **Passage relevance (#8/#11):** Remove unrelated packet material through a
   measured rank/coverage change, preserving negation, exception and footnote
   context and restorable full originals. Large packets are still a limitation.
5. **Evidence-bound rewrite (#38):** Apply independent modality/condition checks
   after the preceding fixes; source strengthening needs actual supporting
   evidence, while style-only changes remain distinguishable.

## Reproduction and limits

Exclusive protocols, report JSON, provider ledger, source hashes, startup failures,
screenshots and `LEAD_MIXED_UI_AUDIT_V4.json` remain outside Git at
`Project_Code/AI_Foundation/experiments/claim-selection-binding-2026-10-05`.
Retain both first outcomes. Do not repeat paid calls to replace errors with passes.
The full-page screenshot has an RTL stitching artifact; viewport capture and DOM
width measurement show no horizontal overflow, so this is not an app overflow bug.

Owner development subsequently merged #85, #92, #95, #99, #100, #104 and #87
(checkpoint `ce54db6`). Current merged-source and shared deployment QA remain
separate. Two related passages do not establish general Islamic accuracy,
editor benefit, stronger-model superiority or judging scores.
