# Rapid, topic-balanced RAG expansion

The next bounded #8 slice is the default-off [retained-page passage index](../evidence/2026-10-05-cache-passage-index.md).
It indexes four selected retained public originals while keeping the same 16-parent
legacy comparison universe. Preferred windows are claim-bound; whole-parent report
storage remains unchanged. SQL/paid checks await a stable isolated protocol and do
not establish reviewer-labelled recall or complete the 170-passage plan.

Proposal dated 5 October 2026. Related to #8; dependencies #4, #5, #7, #11 and #18. This is an implementation plan, not a completed ingestion or a source-approval receipt. The integration dependency is draft PR #59.

## Objective and current boundary

Increase useful passage coverage across the existing nine topic labels, rather than merely accumulating pages. Keep Neon PostgreSQL/pgvector: it already provides a hosted research corpus and a separate reusable public-page cache. The last recorded baseline has 62 passages, 62 vectors and 18 context links; the research cache has five verified public page snapshots. These are pending research records, not a scholar-approved release collection. Consult [the runtime receipts](../evidence/2026-10-05-web-cache-runtime.md) before reporting counts as current.

Local Quran, Tafsir and Hadith indexes are broader than the hosted collection. Do not claim they have all been loaded into Neon. IslamicEval question answers, gold labels and deliberately wrong answers remain evaluation data. Only separately attributed source originals with adequate provenance and permission can become retrieval material.

## First expansion batch

Use a manifest of known public URLs and source locators from the organizer guide and current [source policy](../../config/source-policy.json). Each topic gets a small balanced batch before another large single-topic import. The following are proposed quotas, not measured coverage or promises of approval.

| Existing classification | First target: contextual passages | Example subtopics                                               | Preferred evidence families                                                   |
| ----------------------- | --------------------------------: | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `aqidah`                |                                20 | Tawhid, worship, reliance, limits of inference                  | Quran with relevant Tafsir, attributed scholarly explanation                  |
| `worship`               |                                20 | Prayer, fasting, zakat, pilgrimage; preserve exceptions         | Quran/Tafsir, verified Hadith, permitted fiqh explanations                    |
| `ethics`                |                                20 | Honesty, trust, backbiting, justice                             | Quran/Tafsir, verified Hadith, contextual scholarly explanations              |
| `family`                |                                20 | Parents, relatives, marriage, mutual responsibilities           | Quran/Tafsir, contextual Hadith and permitted explanations                    |
| `transactions`          |                                20 | Contracts, debt, trade, fraud                                   | Quran/Tafsir and attributed fiqh; retain disagreement and conditions          |
| `quran_exegesis`        |                                20 | Verse context, interpretation, wording and reference attachment | Organizer-permitted Tafsir works and complete parent verse                    |
| `hadith_studies`        |                                20 | Attribution, matn variants, grading source and explanation      | Verified source/edition; separate narration text from grading                 |
| `biography`             |                                20 | Prophetic chronology and events                                 | Attributed history/seerah passages; distinguish source claims and disputes    |
| `other`                 |                                10 | Eligible interdisciplinary religious writing                    | Classify conservatively; do not expand into personal fatwas or general advice |

The initial target is 170 new contextual passages across approximately 30–50 pages. One source may contribute to several topics, but repeated quotations must not inflate unique coverage. Topic labels are machine suggestions and may be multi-label; the source kind (`quran`, `tafsir`, `hadith`, `book`, `scholar`) remains separate from topic. A classification never establishes scholarly approval or claim support.

## Fast acquisition sequence

1. **Reuse already acquired originals first.** Inventory the local Quran/Tafsir corpus and the reusable cache. Export only a bounded permitted source manifest. Resolve work, author, edition, license and locator gaps before release ingestion; pending research intake may retain explicit unknowns.
2. **Seed URLs by missing topic and source family.** Curate 3–6 pages per topic from `dawa.center`, `islamic-content.com`, `quranpedia.net`, allowed Dorar services, `shamela.ws/book/`, and the owner-approved BinBaz sections. Follow the policy's exact paths and selectors. Organizer approval of a site does not establish redistribution rights for every book or download.
3. **Fetch the specific pages.** Use Tinyfish for bounded discovery and readable pages; use Firecrawl for deterministic permitted extraction or when Tinyfish gives inadequate content. Deduplicate before fallback fetches. Maintain the current per-review limits; batch ingestion runs separately from user requests, with an explicit batch cap and recorded cost/latency. No unrestricted crawler is needed for this first batch.
4. **Retain the unchanged original and provenance.** Store URL, acquisition time, policy hash, original SHA-256, source locator, attribution, provider-exposed metadata, rights status and approval status. Unknown MIME/status/edition remains unknown. Reject empty pages, broken glyphs, menus, scripts and sources that fail the policy. Do not treat a search snippet as evidence.
5. **Classify with a small typed model.** Use the existing topic classifier, then inspect outliers and disputed labels. Store classifier model/prompt/input/output hashes. Page text is untrusted data; it cannot change the allowed domains, source status, ingestion rules or tools.
6. **Create stable contextual passages.** Use paragraph/sentence boundaries and source-aware verse/Hadith units, typically 400–1,200 Arabic characters, plus neighboring paragraphs as required. Preserve exact UTF-16 offsets and hashes into the immutable parent. Attach conditions, negation, exceptions, footnotes, narration grading and relevant alternate interpretation. Do not split a permission from its restriction just to meet a size target.
7. **Embed and search passages.** Pin embedding model, dimension, representation and chunker versions. Embed selected passages rather than page head/tail summaries. Keep exact-reference lookup, lexical retrieval and dense retrieval, then restore the parent context. Exact pgvector search remains the small-corpus baseline until recall/latency justify an approximate index.
8. **Verify and publish a versioned research batch.** Use checked-in additive migrations and the isolated Neon branch. Validate source identity, offsets, hashes, duplicates, eligibility and runtime roles. Freeze a manifest and corpus version, run the retrieval pack, and record admitted/quarantined counts. Promotion into an approved release corpus requires the content owner's review; it is not an automatic consequence of classification.

## Storage and records flow

`approved URL/locator manifest → acquisition receipt → immutable parent original → classification → contextual passage + parent offsets/hash → embedding → retrieval candidates → restored evidence → claim assessment → immutable report → optional separately validated rewrite`.

Keep two reuse paths. A newly fetched review page can immediately enter the separate research cache with current-policy, expiration and revocation checks. A reproducible curated batch enters a new versioned corpus membership. Neither path changes the frozen baseline in place or silently upgrades pending sources to approved. Future removal revokes availability without changing historical originals and reports.

Passage views in model requests are a useful immediate improvement. They alone do not fix the current durable packet size limit, because the complete originals still occupy the report. The next storage slice must reference immutable retained parents and persist exact selected passages with verifiable offsets; until implemented and tested, retain the existing packet admission limits and disclose skipped context.

## Batch acceptance and evaluation

- All admitted passages round-trip to their exact parent offsets and hash; mutated originals, expired/revoked records and wrong editions are rejected.
- Each topic has both supporting and limiting/disputed context where the source contains it. Search queries seek the whole assertion, not only agreement.
- Use a frozen per-topic retrieval pack with answerable, unavailable, wrong-edition and unrelated-citation cases. Separate retrieval recall/coverage from inference accuracy. A ranked candidate is not proof of support.
- Keep an unseen source-family split and contamination registry. Reusing benchmark answers or tuned cases as supposedly unseen evaluation is prohibited.
- Record passage/source counts, unique topic coverage, duplicate rate, damaged-text quarantine, source-rights gaps, actual embeddings/provider cost and elapsed time. Do not report target quotas as achieved counts.
- Test a mixed-topic public Friday-sermon fixture through the existing UI, durable reports and evidence links. Repeat the same extraction packet separately to measure span selection stability and semantic judgment variation.

## Remaining priorities and owner gates

| Order | Bounded next task                                                                                            | Issue / acceptance evidence                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | Restore staging API routing and identify deployed versions; expose unavailable Foundation capability clearly | #69 / #20: actual browser review and readiness receipt, compatible backend deployment                                   |
| 2     | Stabilize original-span claim candidates and retrieve relevant passage context, including late-page content  | #11 / #8 / #18: repeated-span diagnostics, qualifier/negation adversarial tests and persisted coverage                  |
| 3     | Implement evidence-bound AI-ReWrite as a separate candidate with inspectable citations and copy              | #38: ownership, quotation, new-claim/support and qualification validation; defaults off until accepted                  |
| 4     | Execute the balanced research ingestion batch; resolve rights/edition gaps before approved release           | #4 / #5 / #7 / #8: manifest, isolated database receipt, recall and no-answer evaluation                                 |
| 5     | Run a fixed-packet model comparison and reviewed mixed-topic benchmark                                       | #13 / #18: false support, unsupported contradiction, abstention, repeat stability, latency/cost and source-family split |
| 6     | Confirm source approval, Hadith grading provenance and Tafsir disagreement handling                          | #4 / #9 / #10: named content reviewer and source-specific receipts; matching matn is insufficient                       |
| 7     | Run the editor benefit pilot and final Arabic accessibility/outage checks                                    | #18 / #21: observed useful edits, missed errors, task time and interpretable unresolved results                         |
| 8     | Assemble reproducible demo, secure handoff and submission evidence                                           | #22 / #27 / #61: three cases, evidence index, owner acceptance and actual release/submission receipts                   |

The prior evaluations also require Python/TypeScript quotation parity, explicit reference attachment, full relational/report finding parity, safe input handling and gateway-outage behavior. Existing software repairs must retain regression tests; their implementation is not equivalent to independent scientific validation. Optional voice, OCR, general chat and broad account expansion stay deferred.

## Relation to judging

Technical quality (25%) needs a working deployed loop and reproducible checks. Scholarly reliability (15%) needs approved provenance and qualified content evaluation. Innovation (15%) needs a measured comparison against a stated alternative. UX (10%) needs understandable findings and a completed revision task. Beneficiary impact (20%) needs actual editor outcomes. Operations (10%) needs measured cost, recovery and a source-maintenance owner. Presentation (5%) needs a compact verifiable demonstration. This plan supplies tasks for those evidence gaps; it does not predict scores or certify scientific readiness.

Rollback: disable optional cache/ingestion/rewriting flags and pin the last accepted corpus version. Preserve immutable reports and batch receipts. Owner acceptance and feature PR merges remain separate from research ingestion.
