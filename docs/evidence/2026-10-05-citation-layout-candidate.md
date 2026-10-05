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
measured editorial quality or semantic accuracy. No live provider generation,
deployment or production migration was performed for this evidence.

Lead review repaired three boundary defects: a partial match cannot attribute
unmatched text inside the same quotation wrapper; delayed copy responses cannot
write to the clipboard after navigation or a report-binding change; a length
budget notice remains within the 85-item candidate schema. Targeted regression
checks cover each defect, including faithfully quoted partial references.
An independent Sol Medium pass repaired stale create/cancel response races after
report replacement or a new generation. Final `npm run check` passed: 40 test
files / 569 tests, typechecking, documentation, policy, formatting and build.
The existing Vite bundle-size warning remains advisory.

Durable candidates and substantive wording changes remain gated pending
independent revalidation and human adjudication. See the
[architecture](../architecture/AI_REWRITE.md) and [setup](../operations/SETUP.md).
Acceptance and issue closure remain with Saleh.
