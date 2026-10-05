# Cache delivery diagnostic (#17, related #8)

The fresh port-8772 UI report `0bb5b9ff-fbbd-4854-84f5-ec86b882dfce` reached
the pinned Neon corpus and completed model assessment but had no cached parent
candidates or preferred cache windows. Its retrieval trace does not explain why.
Do not diagnose the historical outcome as a timeout without stronger evidence.

Two frozen read-only diagnostics at committed source `c10b038` reused that exact
public claim and the real 86-passage base corpus on isolated child
`br-weathered-tooth-b2luwnxr`. Each ran four declared cache lookups: fresh-pool
composed search, direct cache search, warmed composed search and full claim
retrieval. V2 used lexical search only; V3 explicitly simulated an unavailable
query embedding through the existing 1,500ms timeout, followed by real lexical
SQL. Neither diagnostic called a provider, generated vectors, acquired pages,
wrote SQL, changed environment files or reconstructed historical provider timing.

All eight arms retained cached sources. Each composed search returned two cached
parents; direct cache search returned eight. Each full claim run bound two durable
claim-specific preferences. The lead independently verified 50 exact source-offset,
parent-hash and passage-hash bindings across both receipts. Final actual-reader
readbacks retained 16 visible cache parents, eight metadata windows and eight vectors.
Delivered cached sources were checked against the retained immutable 16-parent manifest.

Selected timings vary: lexical fresh-pool cache search took about 2.78 seconds,
whereas the simulated-unavailable-embedding fresh-pool search took about 2.90
seconds. Warmed composed searches took about 0.78 and 2.31 seconds respectively.
Fresh pool means fresh connections in that process, not a verified sleeping Neon
endpoint. These timings are diagnostics, not a latency guarantee or a controlled
explanation of the earlier UI outcome. Three historical empty delivery arms remain
retained; these successful runs do not replace them.

The first diagnostic preflight failed because its protocol used the raw JSON-file
hash instead of the canonical loaded-policy hash. It stopped before connecting;
the failure and original protocol remain retained. V2 corrected that binding.

The concrete implementation gap remains: `cached-corpus.ts` starts a separate
3,000ms cache signal and silently discards cache rejection, while the embedding
budget is fixed at 1,500ms and SQL statements can run for 5,000ms. The wrapper
awaits settlement rather than independently bounding an uncooperative operation.
It cannot currently distinguish unavailable cache, unavailable vectors, failed
passage enrichment or a genuine empty result in the persisted per-query trace.

Issue #17 must add coherent bounded operator budgets, cancellation and report-local
outcomes with plain Arabic partial-result feedback. Preserve original source
authority, parent ranking, legacy fallback and explicit failure denominators.
Auth/permission failures must not become automatic retries. Source cleaning adds
another SQL lookup, so reliable cache delivery is a prerequisite for its runtime
activation. Actual preferred-window delivery in a newly persisted UI report remains
an open gate; these diagnostics make no semantic-accuracy claim.

External receipts: `CACHE_DELIVERY_PROTOCOL_V2.json`,
`CACHE_DELIVERY_PROTOCOL_V3.json`, corresponding result receipts,
`CACHE_DELIVERY_LEAD_RESULT_AUDIT_V1.json` and the retained V1 preflight failure,
under `AI_Foundation/experiments/cache-passage-index-2026-10-05`.
