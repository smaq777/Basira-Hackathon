# Bounded cache delivery and report-local outcomes — 5 October 2026

Related to [issue #17](https://github.com/smaq777/Basira-Hackathon/issues/17). This change depends on the reviewed source-content implementation in [draft PR #85](https://github.com/smaq777/Basira-Hackathon/pull/85), based on development `0b13a8c` plus cleaning `ae11c0d`. Source cleaning and retrieval remain optional research capabilities; this is not shared staging or production activation.

## Problem and behavior

The optional cache formerly had a fixed three-second wrapper budget that silently dropped failures. The entire claim-retrieval phase independently stopped after twelve seconds, even with a longer research review budget. A successful empty cache query and an unavailable cache were indistinguishable in the durable report. Optional cache restore could also wait indefinitely when a dependency ignored cancellation.

The composed corpus now races optional cache search and restore against an explicit deadline. It propagates caller cancellation, ignores late results and retains canonical source families, identities and parent order. Cache failures cannot replace a canonical-corpus failure with a successful cached result. SQL statement and connection ceilings help cleanup but do not promise instantaneous termination of an in-flight query or queued connection.

Optional per-call diagnostics record fixed outcomes and stage codes: successful empty, partial embedding/passage/content fallback, cache timeout, or unavailable cache. They contain no raw provider/SQL exceptions, query text, credentials or global mutable trace. Search candidates, selected candidates and restore outcomes are retained in each report's retrieval trace; shared source metadata remains unchanged. Existing reports and corpus adapters without this optional API remain compatible.

The report presents a plain Arabic limited-retrieval notice separately from its semantic finding. Successful empty results do not become outage warnings. A missing candidate or timeout never establishes that no religious evidence exists, and no source/citation/support validator is relaxed.

## Explicit research profile and rollback

Ordinary defaults remain: semantic 60 s, extraction 12 s, assessment 45 s, retrieval 12 s, cache 3 s, query embedding 1.5 s, page/content SQL 5 s, passage SQL 1 s, corpus connection 5 s and pool size 3. Assessment reserve defaults to zero. The historic cache default is shorter than its SQL ceiling and does not guarantee complete cache delivery.

An explicitly selected research configuration can use semantic 240 s, extraction 20 s, assessment 90 s, retrieval 60 s, assessment reserve 90 s, cache 20 s, embedding 2 s, page/content SQL 5 s, passage SQL 3 s, corpus connection 5 s, pool size 6 and outer review deadline 300 s. Configuration rejects excessive ceilings, cache/retrieval contradictions, insufficient extended cache stage room and a reserve that exceeds assessment or the overall allocation. Retrieval receives only the lesser of its ceiling and the remaining semantic time minus the reserve. If no time remains, it is visibly skipped; assessment can use only already validated sources.

There are up to fifteen claim search plans and three workers. Pool contention, canonical retrieval, source packet limits and subsequent discovery can still leave incomplete coverage. A longer ceiling is neither a latency guarantee nor evidence of better religious accuracy. Disable optional research/cache/content flags and return to the documented defaults to roll back. No migration, authentication retry, provider fallback or original-source mutation is introduced by issue #17.

## Evidence and limits

Prior frozen passage diagnostics retained three composed-corpus arms with no cached parents despite valid direct rankings. Later read-only cold/warm checks delivered two cached parents and verified preferences (cold approximately 2.79–2.90 s). These observations are consistent with inadequate timing room but do not prove why the historical full UI report had zero cache candidates. The new diagnostics are intended to distinguish causes on a future actual UI run; no successful full UI cache/content delivery is claimed here.

Cleaning validation on isolated child `br-little-pond-b2y5usie` passed the corrected schema and fourteen role/window probes. Eight paid joint Luna classification outcomes on four declared public originals were valid; removed block IDs were repeat-stable. Two parents removed eleven recognizable boilerplate blocks each. Corrective-footnote and conditional-text controls retained all source content. Parent 8880's topic label varied between worship and ethics. This selected eight-call diagnostic is not general classifier reliability, unseen accuracy or scholarly approval.

First-repeat-only admission created four immutable content views and eight body windows on that child. Independent readback retained all sixteen raw parents and all eight older passage/vector records. Actual reader enrichment verified six hints for the cleaned parents; the two no-removal controls remained identical. This is adapter/isolated-database evidence, not runtime activation or a full UI delivery proof. Frozen source, requests, outcomes, migration failure and repair receipts remain external under `AI_Foundation/experiments/source-content-cleaning-2026-10-05`; issue #17 makes no additional paid calls.

Offline regressions exercise slow success, hung cache/restore/provider work, caller abort, late-result exclusion, expired empty results, simultaneous query isolation, zero-row stage failure, retrieval expiry, assessment reserve and Arabic presentation. Existing actual-flow tests retain source-window bindings and citation delivery. Full check results are recorded with the implementation commit; actual integrated UI rechecking remains a separate lead task.
