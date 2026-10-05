# Supported author wording diagnostic

Related to [#38](https://github.com/smaq777/Basira-Hackathon/issues/38), with
model-routing evidence for #13/#18. Default-off local research implementation;
no deployment, production migration, source approval or scholarly acceptance.

The existing insertion-only proposal now supports narrowly bound author wording
replacements. Eligibility comes from the owned persisted report's supported
claim IDs, original spans and cited evidence. Other text and exact quotations
remain unchanged. A separate request checks both directions of meaning
preservation and every revised material clause against the same source packet.
Conditions, negations, exceptions and scope must each pass, with exact passage
citations. Copy reconstructs the text and rechecks the stored verification hash
after fresh ownership, report and attempt binding. Failure/cancellation exposes
no validated text. The UI displays original/replacement wording and preserved
unreviewed coverage. The task deadline is 90 seconds and storage remains transient.

## Actual public-source diagnostic

A deliberately awkward authored paraphrase used the actual current research
Quran/Muyassar 31:15 originals, including a full exact Quran quotation. This is
selected engineering evidence, not scholar-reviewed gold or unseen accuracy.
The corpus version was
`794bad24b4fc8e774529a86f8c7669459ab2e8bc061910717c931bcab20a79ff`.
All four fresh OpenRouter calls returned HTTP 200 through pinned OpenAI Luna low:
claim selection, assessment, author generation and independent preservation
verification. The source originals stayed frozen; no web retrieval occurred.

Original author wording:

> الوالدين اذا امروا بمعصية من معاصي الله ما لازم نطيعهم في المعصية ولكن لازم انه نصاحبهم في الدنيا بالمعروف فيما لا إثم فيه

Validated replacement:

> إذا أمر الوالدان بمعصية من معاصي الله، فلا يلزمنا طاعتهما فيها، ولكن يلزمنا أن نصاحبهما في الدنيا بالمعروف فيما لا إثم فيه.

The candidate preserved the original obligation wording and both qualifications;
it did not silently change the author's assertion into a stronger prohibition.
The exact source quotation and unreviewed personal comment remained intact.
Actual Quran/Muyassar labels retained the visible pending-research qualifier.
Validated server copy equalled the displayed candidate. Generation plus
verification took **6.834 seconds**; all four calls cost **$0.001703** according to
response usage. This is one fixture, not a latency promise or usefulness estimate.
The separate verifier reported 205 reasoning tokens; private reasoning was not
stored.

Two separately frozen paid verifier controls were rejected: a replacement
inverting obedience and kindness, and one dropping the sinful-order/refusal
condition and the no-sin scope. The second response still considered its shorter
sentence evidence-supported, but rejected mutual meaning preservation. This
demonstrates why evidence entailment alone cannot validate a faithful rewrite;
two selected controls do not establish general semantic safety.

The initial broader 14-source diagnostic generated a supported assessment whose
citations failed exact validation. Its two raw paid responses and partial
`invalid_citations` status remain preserved; no rewrite was generated or copied.
The second protocol narrowed the source family before new calls to the complete
current86 Quran/Muyassar pair. It did not normalize, repair or rescore old output.
External receipts are retained under foundation experiment
`substantive-rewrite-2026-10-05`: original results, `v2-PROTOCOL.json`,
`v2-RESULTS.json`, exact candidate/report, and verifier-control protocol/results.
Credentials, authorization headers, cookies and private reasoning are excluded.

## Routing and software verification

The separate fixed-packet comparison used identical v1.7 prompts and packets for
Luna low and Sol configured medium, two repeats each. Both produced 16/16 valid
selected diagnostic relations; all eight relation repeats stayed stable. Luna's
median was 11.509 seconds and response-reported cost $0.002356, versus Sol's
26.038 seconds and $0.041832. Sol endpoint metadata advertises reasoning effort,
but all four dated generation receipts report zero reasoning tokens. This does
not demonstrate stronger thinking or justify a blanket Sol verifier. Luna is
therefore retained provisionally for a separate verification request. Same-model
agreement is not truth or independent scholarly review.

Targeted software checks cover actual wording improvement, exact quote retention,
pending labels, unknown/duplicate/overlapping claim operations, punctuation-only
changes, source changes, unrelated verifier citations, missing/false preservation
checks, foreign ownership, copy while verification is pending, cancellation,
provider outage and unchanged unsupported claims. The original API/UI lifecycle
tests also remain applicable. Final `npm run check` passed: **42 test files / 575
source tests**, typechecking, documentation links, bounded policy checks,
formatting and production build. The existing Vite bundle-size warning remains
advisory. These software checks do not establish calibrated semantic safety.

Independent lead review repaired a misleading paragraph-only notice when wording
replacements coexist with paragraph breaks, and excluded a supported commentary
when its canonical parent is revoked or rejected. Event reconstruction now has
an explicit type. Focused follow-up validation passed **4 files / 34 tests** plus
TypeScript; the 575-test full check above describes the preceding implementation.
