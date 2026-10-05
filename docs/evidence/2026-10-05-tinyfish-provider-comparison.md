# TinyFish and Firecrawl acquisition comparison

Date: 2026-10-05. Scope: optional research page acquisition, with no semantic model calls or corpus writes. Results describe three current queries and do not establish general search quality, judgment accuracy, or stable latency.

## Documented provider contracts

TinyFish documents both Search and Fetch as free, with an account API key sent in `X-API-Key`. Search is `GET https://api.search.tinyfish.ai`, supports domain restrictions, and returns URL/title/snippet results. Fetch is `POST https://api.fetch.tinyfish.ai`, accepts URLs, Markdown output, freshness and CSS selectors, and returns extracted text or per-URL errors. The published default limits are 30 searches/minute and 150 fetched URLs/minute. Free service still requires account access; it does not imply unlimited throughput. See [Search](https://docs.tinyfish.ai/search-api), [Search reference](https://docs.tinyfish.ai/search-api/reference), [Fetch](https://docs.tinyfish.ai/fetch-api), [Fetch reference](https://docs.tinyfish.ai/fetch-api/reference), and [authentication](https://docs.tinyfish.ai/authentication).

Firecrawl documents Search at two credits per ten results, rounded up; page scraping incurs additional credits. Its scrape response provides target status and content type metadata that the existing adapter validates separately from API transport success. TinyFish's documented Fetch result does not expose equivalent target HTTP status or MIME fields. The TinyFish adapter therefore records `originMetadataStatus: not_exposed_by_provider`; it never fabricates these values or relaxes Firecrawl's checks. See [Firecrawl Search](https://docs.firecrawl.dev/features/search) and [Scrape](https://docs.firecrawl.dev/features/scrape). Actual Firecrawl credits used in this run were not measured.

## Frozen comparison

Receipts and full provider originals are outside Git in sibling `AI_Foundation/experiments/provider-comparison-2026-10-05/`. `PROTOCOL.json`, `RUN_LOCK.json`, and `RESULTS.json` preserve the run. Both providers used the same six-domain source policy, path restrictions, `.fatwa`/`.nass` selectors, first five candidates, two-page acquisition cap, 30-second query budget, and zero retries. Policy SHA-256: `39c58288dd8d6fea94183daff7ab46d0a2968f8e806196f263a33f4f8887760f`. TinyFish used documented Arabic/Saudi localization; Firecrawl retained its existing adapter defaults. Provider rankings, extraction formats and this localization difference remain confounders.

| Frozen query          | Firecrawl accepted pages / elapsed | TinyFish accepted pages / elapsed |
| --------------------- | ---------------------------------- | --------------------------------- |
| Fasting forgetfulness | 2 / 12.247s                        | 2 / 11.933s                       |
| Zakat conditions      | 1 / 6.255s                         | 1 / 15.085s                       |
| Backbiting and truth  | 1 / 6.287s                         | 2 / 7.248s                        |

The run made 18 HTTP requests: six searches and twelve page acquisitions. There were zero semantic calls and zero corpus writes. TinyFish's second zakat fetch failed at transport level; it was not retried. Firecrawl rejected undersized pages in the zakat and backbiting cases. Both providers rejected URLs outside policy.

The two fasting URLs matched. Inspection found TinyFish's shorter Markdown retained the Arabic questions, answers, conditions and exception dialogue; removed controls and link formatting explain much of the size difference. Provider originals have different hashes and remain separate extraction representations, without a canonical fidelity claim. Zakat results differed: Firecrawl acquired a Shamela discussion of the threshold/year qualifications, while TinyFish acquired a Bin Baz explanation of the year for new income. These are related pages, not interchangeable evidence. Backbiting shared a Bin Baz page; TinyFish additionally acquired Dorar's explanation of truth versus false attribution and exceptions. The Dorar page title includes attribution differing from a narration in its body. Attribution remains `page_title_only`, with author/edition unset and no inferred hadith grading.

## Implementation and decision

`createTinyfishWebDiscovery` and `createTinyfishGapDiscovery` enforce policy URL checks, bounded JSON bodies, text/identity validation, immutable hashes and cancellation. Snippets never become evidence. All acquired pages stay `pending`, `researchOnly: true`, with rights pending and `scholarlyApproval: false`. Obvious error/challenge pages are rejected; unavailable origin metadata remains an explicit limitation.

The optional `tinyfish_first` configuration uses `createCompositeGapDiscovery`: a 30-second combined budget, a 15-second primary child, and a Firecrawl fallback child bounded by the remaining time and 15 seconds when fewer than two valid page URLs remain. A bounded 50ms cleanup allowance, inside the combined deadline, retains cooperative partial results after cancellation. The first provider's representation wins for a shared URL, preventing a page acquired twice from becoming two evidence votes. Output is capped at two pages and nine failure codes; raw adapters can each attempt two page acquisitions. Valid primary pages survive fallback failure. Existing default configuration remains Firecrawl.

This decision uses TinyFish's documented free acquisition and observed complementary Dorar coverage in this small run. It makes no provider-wide superiority claim. Fifty-one focused acquisition, source-policy and composite tests pass, along with TypeScript checking. Runtime integration and broader application validation are tracked separately.
