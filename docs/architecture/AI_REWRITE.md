# Evidence-bound AI-ReWrite proposal

Status: supported author wording and citation/layout research slices implemented
behind a default-off local flag. Related: #38, #13, #18,
#68. Preserve the 3,000-character review scope and original revision.

## Implemented supported author wording — 5 October

The local action «تحسين الصياغة وإضافة التوثيق» now accepts replacements only for
exact server-owned author claim spans whose persisted semantic finding is
supported. Classified source spans, complete quotation wrappers, unsupported
claims and unselected text are preserved. The generator cannot replace the whole
draft, correct a contradicted claim by changing its meaning, invent a reference,
or overwrite the original revision. Changes must alter wording beyond punctuation.

After deterministic identity, range, source, quotation and length checks, a
separate pinned model request verifies mutual meaning preservation and support of
every revised material clause from the same immutable evidence. Conditions,
negations, exceptions and scope each have an independent required check. Exact
passage citations are required. A false, missing, malformed, unavailable or
ambiguous check rejects the whole candidate. This is provisional model validation;
it is not independent scholarly adjudication or a calibrated semantic guarantee.

Copy reloads the owned report and current attempt, reconstructs the candidate,
and revalidates the stored verifier output and its input/operations hash. The
90-second shared task deadline covers generation, verification and report reload.
Provider failure or cancellation never exposes generated text for validated copy.
Both requests currently use Luna low: the fixed-packet comparison found no
relation improvement from configured Sol medium, whose receipts reported zero
reasoning tokens. A separate request is independent of the generator's answer,
but using the same model does not provide independent human judgment.

The UI shows original and replacement wording, source labels and unresolved
coverage. It explicitly says only displayed supported spans were improved and
all remaining text was preserved. Ten-minute session-bound memory, ownership,
idempotency, cancellation, default-off production controls and manual acceptance
remain as described below. See [new evidence](../evidence/2026-10-05-substantive-rewrite.md).

## Historical citation/layout first slice

The current button is «تنسيق النص وإضافة التوثيق». It selects paragraph breaks and
actual recorded citations, creates a separate candidate, and offers copy only
after deterministic validation and a fresh server ownership/report check. The
model returns insertion operations, never replacement text, verdicts or new
source metadata. Every original UTF-16 unit remains unchanged. Consequently this
slice cannot remove negations/qualifications, add new claim wording, complete a
partial Ayah or correct an incorrect quotation. Faithful partial excerpts remain
eligible for attribution; extent alone is not an error. Whole quotation wrappers
and classified source spans are protected from internal insertions. Unsupported
claims and unavailable semantic assessment remain unresolved in the candidate.

Generation uses a pinned OpenRouter model/provider with a 30-second total task
ceiling and bounded JSON response. The API loads the original through the owned
revision and persisted report, checks immutable input/evidence hashes, then binds
the complete report and current review attempt. Every status/read/copy/cancel
request rechecks database ownership and report binding; clients submit only the
expected hashes and an idempotency key. No client verdict is trusted. Cancellation
by key creates a tombstone, preventing a late create after UI navigation from
starting model work. Copy revalidates allowed insertions against the current
report before returning the text.

Candidates are explicitly **session-bound memory** with a ten-minute TTL, at
most three attempts per review in that window and at most 64 retained tasks.
Restart/multiple-instance recovery and durable candidate revisions are not
implemented. This is an isolated research prototype, not persistent editorial
history. The flag `FOUNDATION_REWRITE_ENABLED=true` requires a loopback-only
foundation research preview and the owning OpenRouter key; startup rejects
production. Source approval remains pending wherever the report records it.
Readable citations are rendered server-side; URLs are not generated or appended.
Oversized additions are omitted within the 3,000-unit limit with an explicit note;
the original is never trimmed. Empty insertion output is permitted without
claiming the text was corrected.

Substantive prose changes require the independent re-assessment and scientific
gates below. Existing report assessment is retained because author wording is
unchanged; this slice makes no new semantic determination or scholarly approval.

## One-click user flow

From a completed review, «تحسين النص وتوثيقه» creates a separate candidate draft. The server derives its input from the owned persisted report, not client-submitted verdicts. Show progress, then the proposed text, concise changes and readable references. After automatic revalidation succeeds, offer «نسخ النص» with citations included. Keep the original and a comparison available; copying does not replace or publish it.

If no adequate evidence exists, offer editorial wording or identify the unresolved passage; do not promise evidence strengthening. If the candidate fails validation, retain the original, explain the failed check in Arabic, and allow retry only within bounded limits. Do not display a success/approval badge for a generated draft.

## Proposed broader generation contract — separately gated

- Input: original revision/hash; selected supported findings; their exact evidence IDs and original excerpts; known conditions/negations/exceptions/scope; citation metadata; unresolved findings; approved style rules.
- Output: candidate text, changed original spans with reasons, exact citation IDs, unresolved items, and revision/report binding. No invented source, author, page, hadith number, authenticity grade or scholarly approval.
- Preserve correct Quran/hadith quotation spans verbatim. Correct a demonstrated textual error only through the deterministic comparison's identified original and visibly disclose the change. Do not silently complete a partial Ayah or erase context-sensitive omissions.
- Improve author prose and citation placement. Strengthen a claim only when the supplied evidence entails every material clause. Otherwise retain, qualify or propose removing the unsupported clause with a clear explanation; do not disguise a changed claim as a cosmetic edit.
- Unknown author/edition/number remains unknown. A URL alone is not a citation proving support. Evidence from a pending research source remains visibly provisional.
- The model cannot browse, execute draft/page instructions, modify source policy or change approval states. Retrieved originals remain separate from generated prose.

## Style source and validation

Use the hackathon source guide's principles: clear language, attribution, distinction between quotation and explanation, preservation of disagreement and abstention where evidence is missing. A small reviewer-approved style rubric may be distilled from permitted scholarly writing: concise claims, evidence immediately adjacent, explicit qualifications and no exaggerated certainty. Do not imitate or imply authorship by a named scholar, and do not copy long copyrighted passages into templates.

Re-run input length/control-character handling, quotation detection/fidelity, citation identity checks and claim-support assessment on the new revision. Require no new unsupported or contradicted claims, no new quote mismatches, and no lost material qualification; model self-approval alone is insufficient. Assess a frozen mixed-topic positive/negative pack with human adjudication before enabling broad semantic changes. Start with citation placement and evidence-preserving editorial edits; gate substantive claim changes separately.

## Delivery sequence and acceptance

1. Freeze the current review, corpus and policy versions; repair measured retrieval/quotation coverage gaps first.
2. Add typed candidate/rewrite contracts and owned immutable revision persistence, with source/report binding and cancellation/idempotency. Keep feature disabled by default.
3. Implement a bounded generation plus validation pipeline, preserving original reports on provider failure. Store safe operational traces, not private model reasoning.
4. Add the one-click result action, candidate comparison, unresolved-item message and accessible copy confirmation in the existing UI.
5. Test tampered verdicts/citations, missing source metadata, negation loss, partial Ayah, incorrect quotation, provider timeout, unrelated claim insertion and foreign-session access. Measure edit usefulness/time saved separately from software correctness.

A passing candidate is an editorial suggestion linked to evidence, not a fatwa, publication authorization or scholarly approval. Owner acceptance governs rollout.
