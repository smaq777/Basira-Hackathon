# Live web acquisition and reusable-cache integration

Date: 2026-10-05. Related: #8, #18, #38, #68 and draft PR #59. This is a local engineering diagnostic using public Arabic sermon writing, real OpenRouter models, bounded Tinyfish/Firecrawl acquisition and the isolated Neon research database. It is not a scholarly accuracy benchmark or production deployment.

## Protocol and observed failures

The frozen Amanah input from the existing sermon diagnostic was reused unchanged. Receipts, complete provider originals and owned reports remain outside Git in `AI_Foundation/experiments/sermon-evaluation-2026-10-05/`. The initial `extended-cache-v1` pair failed after 93.577 and 69.103 seconds, with no durable report. An additional diagnostic retry also failed. These runs are retained; they are not replaced with successful results.

The cache nevertheless grew from two previously validated public pages to five public originals, with machine topics and intact original hashes. This established acquisition and cache writes, not successful report delivery. The new pages came from Shamela, Dawa Center and Quranpedia. No synthetic records were inserted to force a cache hit, and the cache was not cleared between attempts.

The captured `extended-cache-diagnostic-v3` run completed in 85.408 seconds: 43 source records, completed extraction/assessment/gap assessment, and two newly attached web representations. Discovery was `reassessed`; the persisted report was partial because source-review limitations remained. All three extracted claims stayed `not_established`. The acquisition and reassessment path worked, but initial retrieval contained no cache keys, so this run did not prove reuse.

The next identical `extended-cache-reuse-v4` review failed after 75.199 seconds. A bounded, content-free worker diagnostic identified `REPORT_TOO_LARGE` in `report_persistence`. The JavaScript and SQL durable-report limits are both 500,000 bytes; counts alone had admitted too much optional source text. Source originals are represented in both the rendered report and durable evidence rows, and PostgreSQL JSONB serialization adds overhead.

## Corrections

- Retrieval and gap acquisition admit evidence against a byte budget before assessment, retaining complete source families and reserving report space. The global storage limit is unchanged.
- The worker checks optional enriched report size before attaching it or binding its evidence hash. If optional enrichment is oversized, original quotation/source results remain saveable; already-cited sources are never trimmed after judgment to make a report fit.
- Cache query embedding has a separate 1.5-second budget. A slow embedding request falls back to lexical lookup while the outer search remains active. External cancellation still stops the operation.
- Initial corpus and live-discovery paths deduplicate identical URL/original representations across storage aliases. Canonical source families and changed originals are preserved.
- Failure diagnostics contain only the stage and bounded machine code, never draft, source, provider or SQL text.

The research profile permits 300 seconds per review with bounded phase budgets, cancellation and lease renewal. Longer time improves the opportunity to retrieve evidence; it does not establish source relevance or correct judgment. Mixed-topic human-adjudicated evaluation and the gated AI-ReWrite implementation remain next priorities.

## Final paired delivery and reuse receipts

The unchanged frozen Amanah pair in `extended-cache-final-v6` persisted both reports: 71.096 and 58.982 seconds, each with 26 complete source records, seven quotation findings, and completed semantic extraction/assessment. Both initial packets retained the same two real cache originals from Quranpedia and Shamela. The second report therefore proves reusable page evidence enters retrieval before assessment. No cache was cleared and no synthetic evidence was inserted. Local PostgreSQL report equality, original SHA-256 checks, and final semantic evidence-hash binding passed for both; rendered JSONB reports measured 174,646 and 172,132 bytes. The external `extended-cache-final-v6-PERSISTENCE.json` retains these checks and keys.

Both final discovery attempts visibly ended `packet_budget_skipped`: additional complete pages would exceed reserved evidence byte headroom. They did not run a gap reassessment. The earlier retained `extended-cache-diagnostic-v3` receipt separately proves successful live page acquisition, attached originals and gap assessment with durable report delivery. This is combined engineering evidence across runs, not a claim that the final pair exercised every stage. Five isolated cache rows retained full verified originals, machine topic labels and classifier provenance; shared source provenance contained no private query hash, gap reason or review identifier.

The intermediate `extended-cache-budget-v5` pair preserved quotation reports but did not complete semantic assessment: first retrieval returned a generic unavailable result; second extraction exceeded the default 12 seconds. A faithful read-only replay of the first extracted claims, using the actual frozen hosted version and pinned query embeddings, subsequently succeeded in 3.979 seconds with lexical/semantic candidates and two cache keys; the transient retrieval failure was not reproduced. The explicit research extraction budget was raised to a bounded 20 seconds while the default remains 12 seconds and overall research semantic limit remains 240 seconds. Known retrieval failure codes now receive content-free diagnostics.

Automated assessments varied between identical inputs: the final first report extracted four claims with one `supported`, while the second extracted three claims all `not_established`. These receipts establish delivery, provenance, limits and cache reuse, and do not establish stable claim extraction, scholarly correctness or improved accuracy.
