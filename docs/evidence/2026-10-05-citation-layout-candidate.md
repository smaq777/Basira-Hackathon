# Evidence-bound citation/layout candidate

Related to [#38](https://github.com/smaq777/Basira-Hackathon/issues/38). The first
implementation is default-off, local research only. It formats paragraphs and
places recorded citations; it does not paraphrase prose, strengthen weak claims,
correct quotation errors or grant scholarly approval.

The result action «تنسيق النص وإضافة التوثيق» loads an owned persisted report and
immutable revision on the server. The client submits expected input/evidence
hashes and an idempotency key, never verdicts or references. A pinned small model
selects insertion operations only. Server construction preserves every original
character, quotation, negation and qualifier. Actual source metadata supplies
readable citation labels. Pending sources remain visibly pending; revoked and
rejected sources are excluded. Faithful partial excerpts are eligible for
attribution without treating quotation extent as an error. Whole Quran brackets,
braces, parentheses and quote wrappers are protected from internal insertions.
Unsupported claims and unavailable semantic assessment remain unresolved.

The candidate is separate from the original, has a ten-minute session-bound
memory TTL, and does not survive restart or support multiple-instance recovery.
There are at most three attempts per review in that window and 64 retained tasks.
Generation/reload/validation has a 30-second total ceiling and a 40 KB provider
response limit. A keyed cancellation tombstone prevents late create after UI
navigation. Every read/copy/cancel reloads database ownership, revision, full
report/evidence binding and review attempt. Copy deterministically revalidates
insertions before returning text. Near-limit drafts retain the entire original;
additions that cannot fit within 3,000 UTF-16 units are omitted with an explicit
note. No original is overwritten and no migration or publication is performed.

Synthetic tests cover foreign credentials, verdict/hash tampering, invented
citations, new prose and negation-loss fields, revoked sources, protected quotes,
faithful partial excerpts, 2,982-unit preservation, UTF-16 overflow, provider
outage/oversized output/timeout, stale attempt and evidence, idempotency, expiry,
bounded retries and keyed cancellation. The UI workflow checks copy is absent
while pending and requests fresh server validation before clipboard access; it
also tests unmount before a late create. These are software-contract checks, not
measured editorial quality or semantic accuracy. No deployment or production
migration was performed.

Lead review repaired three boundary defects: a partial match cannot attribute
unmatched text inside the same quotation wrapper; delayed copy responses cannot
write to the clipboard after navigation or a report-binding change; a length
budget notice remains within the 85-item candidate schema. Targeted regression
checks cover each defect, including faithfully quoted partial references.
An independent Sol Medium pass repaired stale create/cancel response races after
report replacement or a new generation. Final `npm run check` passed: 37 test
files / 533 source tests, typechecking, documentation, policy, formatting and build.
The test command excludes compiled `dist` artifacts: the earlier 40-file / 569
run included 36 duplicate compiled contract tests; the source-only run has 37 files.
The existing Vite bundle-size warning remains advisory.

## Live integration follow-up

The combined repository app passed 39 files / 550 source tests and required
checks in an isolated checkout. A fresh public Amanah/justice draft was reviewed
through the UI: one compound author span was provisionally supported, a faithful
partial Ayah stayed in the matching group, the separate proposal preserved all
original characters, and clipboard contents matched the displayed candidate.
The first citation prompt chose only a paragraph break. A quotation-only API
trial took 6.199 seconds for review and 3.739 seconds for generation; it returned
a validated no-change proposal despite an eligible recorded reference. Both
outcomes remain evidence of a usefulness gap, not successful citation addition.

Prompt `citation-layout-v1.1` explicitly distinguishes pending research attribution
from approval and specifies the citation operation shape. Three frozen-packet
OpenRouter repeats returned HTTP 200, selected the same actual Quran reference
and passed deterministic validation (3.160, 1.689 and 1.860 seconds). All original
characters remained intact and the pending-source qualifier was added. This
small repeated case does not establish mixed-topic usefulness or semantic accuracy.
The UI now states when a proposal adds only paragraphs or makes no change, and
does not claim new documentation when none was added.

Raw public-text receipts and screenshot are retained locally in the foundation
experiment `integration-lead-v1`; no credential or ownership cookie is saved.
The quotation-only assessment classification was separately repaired under #11;
it must not be reported as model or API failure when no author claim exists.

Durable candidates and substantive wording changes remain gated pending
independent revalidation and human adjudication. See the
[architecture](../architecture/AI_REWRITE.md) and [setup](../operations/SETUP.md).
Acceptance and issue closure remain with Saleh.
