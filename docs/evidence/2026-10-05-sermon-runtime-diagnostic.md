# Frozen sermon runtime diagnostic

Six cases ran once on 5 October 2026 through the rebuilt local runtime with semantic assessment, hosted retrieval, and web discovery enabled. Three are complete captured paragraphs from [Bahrain's official Amanah sermon](https://www.islam.gov.bh/خطبة-الجمعة-الأمانة-قيمة-راسخة،-وأهمي/), Alukah's [parents sermon](https://www.alukah.net/sharia/0/124660/بر-الوالدين-خطبة/), and [backbiting sermon](https://www.alukah.net/sharia/0/138216/ذكرك-أخاك-بما-يكره-خطبة/); three are separately authored negative controls. Source originals and reports remain external in `AI_Foundation/experiments/sermon-evaluation-2026-10-05/`, never in Git or the Neon source corpus.

Protocol SHA256: `868a1ae923e3f99dfa360349582d700a88c3fcf13e9a5fe61d04b947b9298fe3`. The real excerpts contain 1,243/653/251 characters; controls contain 146/188/199. Selection, exact input hashes, source-file hashes, URLs, expectations, and limitations were frozen before execution. Published excerpts are not adjudicated correctness gold. Controls test limited support expectations, not comprehensive religious accuracy.

| Frozen case                                | Time    | Sources / quotation findings | Semantic outcomes              | Web-gap outcome                                       |
| ------------------------------------------ | ------- | ---------------------------- | ------------------------------ | ----------------------------------------------------- |
| Real Amanah                                | 54.527s | 42 / 7                       | 1 supported, 2 not established | Failed: `body_too_large`; no added evidence           |
| Real parents                               | 34.296s | 22 / 4                       | 1 supported, 1 not established | No evidence                                           |
| Real backbiting                            | 22.246s | 15 / 1                       | 1 not established              | Failed: `discovery_body_too_large`; no added evidence |
| Synthetic unconditional parental obedience | 16.178s | 15 / 1                       | 1 contradicted                 | Not needed                                            |
| Synthetic reversed backbiting condition    | 14.153s | 12 / 1                       | 1 contradicted                 | Not needed                                            |
| Synthetic exclusive/greatest Amanah claim  | 22.201s | 22 / 1                       | 2 contradicted                 | Not needed                                            |

All six reports completed semantic processing; the overall review status was partial, consistent with incomplete quotation resolution. All four extracted negative-control claims were contradicted. This is a useful bounded safety diagnostic, not an accuracy percentage for arbitrary sermons. Real excerpts received two supported and four not-established findings; lack of support in supplied evidence is not a finding that the published sermon is false.

The Amanah obligation was supported using source originals, while its ease exception and a necessary-condition generalization remained unestablished. The parents passage supported the importance of parental rights but lacked retrieved originals covering companionship with unbelieving parents. The backbiting passage recovered a full local hadith original, yet the author's additional conjunction of backbiting and false accusation was not established by the quoted distinction. Human review remains necessary for these interpretations and extraction coverage.

Quotation outcomes were conservative: real Amanah had one normalized, three partial, three unresolved; parents had one partial, two unresolved, one mismatch; backbiting remained unresolved. Each negative control had one partial quotation finding. None of these labels proves authenticity or author-claim support. Successful semantic assessment does not imply successful complete quotation identification.

Three gaps were attempted, none skipped for elapsed-time budget. No new web snapshot reached a report and no gap reassessment ran in this baseline. The two size failures have different causes:

- Amanah encountered a claim evidence headroom issue: 19 distinct existing keys plus up to two discovery snapshots could exceed the 20-key contract. Reserve discovery capacity before acquisition; retain this baseline before a targeted rerun.
- Backbiting search selected a whole Quranpedia chapter page rather than a bounded passage: the subsequent diagnostic probe observed roughly 1.81 MB JSON and 996,815 Markdown characters at `https://quranpedia.net/surah/1/3/book/301`. The acquisition guard correctly rejected the oversized whole chapter. The next priority is query/page granularity or bounded structured passage acquisition, not globally raising body limits.

The parents search returned no eligible new evidence. The explicit allowance policy establishes acquisition eligibility only; it does not grant scholarly approval, resolve edition attribution, or turn search results into authoritative truth.

Persistence verification used read-only queries: all six HTTP report objects equal their durable stored reports; repeated reads are identical; frozen original inputs and revision hashes match; every stored original evidence SHA256 recomputes correctly. No web provenance could be validated end to end in this baseline because zero web snapshots were added. These checks verify durable refresh data, not a new browser interaction.

Provider trace records 12 successful extraction/assessment requests and $0.298576025 in reported model usage cost, excluding embedding, Firecrawl, and unverified billing. Exact provider IDs, request/response hashes, evidence bindings, retrieved keys, discovery query hashes, and failure codes remain in external reports. No hidden provider reasoning or copyrighted sermon originals are committed.

Follow-up should preserve the six-case baseline, fix the evidence headroom issue, rerun only the affected Amanah case with explicit new run lineage, and address chapter-sized discovery separately. Broader sermon evaluation needs a fresh locked pack with human-adjudicated claims and coverage labels before claiming general quality gains.

## Targeted Amanah run after evidence-capacity fix

The same frozen Amanah input ran once after the rebuild that reserves two evidence keys for discovery. Separate receipts are in external `sermon-evaluation-2026-10-05/amanah-headroom-v2/`; the original six-case baseline is unchanged. The run took 54.530 seconds, retained seven quotation findings and 41 source snapshots, and produced the same three extracted claims and status sequence: not established, supported, not established.

Discovery was `budget_skipped`, with the same frozen claim/query hash and no added web evidence. Extraction took 7.940 seconds and initial assessment 22.077 seconds, versus 7.263/17.019 seconds in the baseline. The runtime did not have enough remaining budget for its reserved discovery/reassessment window. Consequently, this run does not demonstrate successful live acquisition, validate web snapshot provenance end to end, or establish a model-quality improvement from the capacity fix. No further Amanah retry was made.

The targeted HTTP report again equals durable stored JSON; repeated persistence reads, frozen input hash, and all 41 original source hashes passed. Recorded additional model usage cost was $0.093111925, excluding embeddings and unverified billing. A later bounded acquisition demonstration needs an explicitly suitable deadline or cheaper initial assessment while preserving this observed timeout-budget outcome.

## Separate short engineering smoke

One authored, unquoted 57-character sentence about parental duties and disobedience in sin was frozen separately before execution, protocol SHA256 `5462ec099076bc6898df931e45f1613d1a9fa96c89e1b5a08ad465e67d8671da`. It is an engineering smoke with no gold labels or accuracy claim; the six-case baseline was unchanged. It completed in 26.265 seconds with 19 source snapshots, no quotation findings, and two provisional supported claims. Durable report equality, repeated reads, frozen input, and all original hashes passed.

The first assessment supported both claims using existing evidence, so no discovery trigger, acquisition, or reassessment occurred. It inferred the scope of unbelieving parents from general parental-duty commands; the earlier real-parents paragraph received not established for explicit companionship in that circumstance. Inputs and extracted spans differ, so this is not a controlled demonstration of inconsistency or error, nor evidence that general commands cannot entail that scope. A frozen same-claim/same-evidence comparison with expert adjudication would calibrate this candidate sensitivity. End-to-end web snapshot persistence therefore remains unproven by these runs.

Recorded smoke model cost was $0.039989175. Across baseline, targeted Amanah, and smoke: 16 model requests, $0.431677125 reported model usage, excluding embeddings/Firecrawl and unverified billing. No additional provider calls were made after this smoke. Protocol and receipts remain external under the `short-gap-smoke` lineage.
