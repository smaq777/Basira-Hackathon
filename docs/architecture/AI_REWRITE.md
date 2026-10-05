# Evidence-bound AI-ReWrite proposal

Status: scoped next implementation, not enabled. Related: #38, #13, #18, #68. Preserve the 3,000-character review scope and original revision.

## One-click user flow

From a completed review, «تحسين النص وتوثيقه» creates a separate candidate draft. The server derives its input from the owned persisted report, not client-submitted verdicts. Show progress, then the proposed text, concise changes and readable references. After automatic revalidation succeeds, offer «نسخ النص» with citations included. Keep the original and a comparison available; copying does not replace or publish it.

If no adequate evidence exists, offer editorial wording or identify the unresolved passage; do not promise evidence strengthening. If the candidate fails validation, retain the original, explain the failed check in Arabic, and allow retry only within bounded limits. Do not display a success/approval badge for a generated draft.

## Generation contract

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
