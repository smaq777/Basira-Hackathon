# Controlled web discovery hypothesis

Issues #8, #13, #17 and #18; research-only implementation in draft PR #59.

## Question and decision

Can bounded discovery add missing evidence without turning topical similarity or
missing sources into support? The eight-case paired experiment supports continuing
the hypothesis. It does not establish scholarly correctness or general accuracy.
Firecrawl remains an experimental acquisition module, outside the default review
path and without a new UI. Neon remains the reproducible source store; MCP and web
APIs acquire sources rather than replacing evidence validation.

The adapter uses a configured allowlist (initial research paths on binbaz.org.sa
and shamela.ws), optional path exclusions, fixed HTTPS API destinations, validated
result and final URLs, bounded response size, cancellation and deadlines. Search
snippets never become evidence. Acquired markdown retains URL, title, retrieval
time and SHA256, marked pending/research-only. It is an extracted representation,
not a canonical Quran or hadith edition. Domain eligibility does not confer
scholarly or rights approval. No autonomous unlimited search loop is enabled.

## Frozen experiment

Eight fixed assertions covered fasting, zakat, parents, backbiting, contracts and
an invented company policy. Three assertions were negative controls. The known
Tawhid/Ibn Baz probe was excluded. Discovery allowed one search and at most two
page acquisitions per case; no retries were made after freezing the batch.

Ten page snapshots were accepted across five cases. Two cases received HTTP 429
while acquiring pages; the company-policy search returned no results. These
failures stayed in the comparison. No held-out web pages entered the baseline
62-passage Neon research corpus.

The same eight claims were assessed in two arms using the captured v1.5 runtime
prompt, OpenAI's `openai/gpt-6.1-sol` through OpenRouter, low reasoning and no
fallback. Two batches per arm produced four paid calls. Baseline retrieval was
lexical plus restored context; this experiment did not compare dense retrieval.

| Case                                             | Corpus-only     | With acquired web passages               |
| ------------------------------------------------ | --------------- | ---------------------------------------- |
| Forgetful eating while fasting                   | Not established | Supported                                |
| Deliberate eating has no effect (negative)       | Not established | Contradicted                             |
| Zakat with threshold and elapsed-year conditions | Not established | Supported                                |
| Zakat applies below threshold (negative)         | Not established | Contradicted                             |
| Kindness to parents without obedience in sin     | Not established | Supported                                |
| Truthful speech can constitute backbiting        | Not established | Not established; acquisition unavailable |
| Fulfilment of lawful contracts                   | Not established | Not established; acquisition unavailable |
| Invented company policy (negative)               | Not established | Not established; no results              |

All four responses passed route, schema, claim identity and exact citation checks.
No tested negative control was supported. Model-call durations were 16.122,
24.807, 7.723 and 6.887 seconds; reported model cost was $0.386084, excluding
discovery, embedding, storage and previous acquisition costs. This is offline
batched assessment timing, not UI latency. Discovery took 0.713–5.978 seconds per
case. The largest enriched batch used 53,398 prompt tokens, so source selection
and context budgets matter before runtime promotion.

## Limits and reproducibility

One stochastic call per batch/arm, eight preselected cases and no independent
scholarly gold labels cannot establish an accuracy percentage. Research editions
and rights remain pending; markdown can contain navigation, audio or link
artifacts. Source quality, paragraph boundaries and qualifier preservation need
human adjudication. Rate limiting materially reduced coverage.

Frozen protocols, packet hashes, originals, response receipts and per-case
findings are retained outside Git in the owner's
`AI_Foundation/experiments/firecrawl-hypothesis-2026-10-05` directory. Raw sources,
credentials and full drafts are not committed. Automated tests cover URL policy,
redirect rejection, traversal, snippet exclusion, malformed metadata, body limits,
rate limits and bounded cancellation. Default tests make no provider calls.

Before promotion: broaden held-out topics and scholar-reviewed controls, measure
incremental retrieval relevance and end-to-end latency, resolve source rights,
and define a bounded rate-limit/cache policy. AI-ReWrite remains gated by reliable
claim coverage and evidence-bound assessment.
