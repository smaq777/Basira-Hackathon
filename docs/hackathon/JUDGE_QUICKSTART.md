# Judge quickstart

Open [Basirah staging](https://api-staging-42bc.up.railway.app/) as a guest. The post-PR179 deployment failed, and the latest readiness checks timed out. The recorded 30e25db acceptance below does not establish current availability. No team account, provider API key or local MCP setup is required.

Basirah checks two distinct things: **quotation fidelity** and **whether the evidence supports the author's conclusion**. Source access and generated findings do not constitute scholarly approval. The public demonstration uses a 175-passage research corpus with pending source approvals.

The [dated release evidence](../evidence/2026-10-06-verified-judge-quickstart.md) identifies the observed deployment, report receipts, rewrite success and retained failures. A merged PR or green build alone does not establish deployment.

Before a live demonstration, require HTTP 200 from `/health`, `/ready` and `/api/v1/capabilities` on the recorded deployment. If that gate fails, inspect the retained evidence instead of counting an unavailable run as acceptance. Once ready, paste one example below, start its review, then inspect the original quotation, author claim, selected sources and provisional assessment.

## 1. Conditional support and a useful rewrite

Paste this exact case:

> قال تعالى: «وإن تخفوها وتؤتوها الفقراء فهو خير لكم» [البقرة: 271]. إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق.

Expected: the quotation aligns with Quran 2:271; the author claim is **supported** within the linked conditions of hiding the charity **and giving it to the poor**. The recorded release retrieved the Quran plus Muyassar and Saadi Tafsir. Inspect attributed source text and exact cited excerpts separately from the generated explanation. This result does not establish that giving to the poor is better than every other charitable use.

Request an AI-ReWrite. Inspect the proposed author change before copying: the quoted words must remain verbatim, and the original meaning, hiding and poor-recipient conditions must remain intact. Do not add a comparison target absent from the author's wording, even when a source explains that comparison. A controlled live result changed:

> إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق

to:

> إخفاء الصدقة وإعطاؤها للفقراء أفضل للمتصدق

Wording may vary on a new run. The first recorded attempt was withheld; a separate controlled attempt passed generation, preservation and independent verification. Copy only a validated result after the copy action succeeds. Its displayed text and clipboard must match, including its recorded attribution. The original report remains unchanged. Cancellation must withhold candidate text and copying.

A separate pending-code control improved the rough author wording `لما نخفي الصدقة ونعطيها للفقراء فهذا خير للمتصدق` to `إخفاء الصدقة وإعطاؤها للفقراء خيرٌ للمتصدّق.` while preserving scope. This was a local frozen-source control; its generation policy is not yet deployed. See the dated evidence rather than expecting this new result from the current website.

## 2. A correct quotation can carry a wrong conclusion

First paste:

> قال تعالى: «وكلوا واشربوا ولا تسرفوا» [الأعراف: 31]. تدل الآية على النهي عن الإسراف في الأكل والشرب.

Expected: **supported**, with the prohibition against excess preserved.

Then paste the contrasting case:

> قال تعالى: «وكلوا واشربوا ولا تسرفوا» [الأعراف: 31]. تدل الآية على أن الإسراف في الطعام والشراب مطلوب شرعًا.

Expected: the same quotation remains aligned, while the author's inference is **contradicted**. The explanation and scope must identify the claim as contradicted rather than endorse it. Inspect the exact source excerpt containing `ولا تسرفوا`. On the recorded restored release, both reviews included Quran 7:31 and two live Tafsir works.

This is the central distinction: accurate quotation does not establish the conclusion drawn from it.

## 3. Missing evidence produces bounded abstention

Paste:

> قال رسول الله صلى الله عليه وسلم: «أعلنوا هذا النكاح». وقال لعبد الرحمن بن عوف رضي الله عنه: «أولم ولو بشاة». إقامة وليمة النكاح من إظهار الفرح بنعمة الزواج.

Expected: **insufficient_context** with no selected sources or citations in the recorded packet. The report should explain that evidence for the exact narration/claim was unavailable. A verse about marriage, love or mercy must not become a substitute for evidence about a wedding feast.

Zero references here is an abstention, not a verdict that the narrations are false or unauthentic. A provider failure is different: `unavailable`/`gateway_blocked` means assessment did not complete and cannot count as successful abstention. Preserve the original and the first outcome.

These inputs are copied from the [bounded acceptance runner](../../scripts/acceptance-submission-staging.mjs). The runner makes live provider calls only with explicit scoped authorization; judges can use the website directly.

## Evidence and limits to inspect

- Confirm the displayed source identity, reference, edition/provenance and research status. Quotation text, generated explanation and suggested rewrite have different roles.
- Reload the saved report in the same guest session. Guest reports are protected by ownership; report IDs are not public share links. Expiring sessions and transient rewrite candidates can limit later access.
- The ambiguous Tawhid example with `(سورة النحل، الآية: )` is a limitation case, not a successful demonstration. Its Quran excerpt matches both 31:25 and 39:38; neither reference may be chosen silently. Its quoted Muadh wording remained unresolved. See the dated evidence.
- Selected live successes do not measure broad recall, general Arabic accuracy, scholarly reliability or 100% rewrite success. Mobile and reviewer/publication/email acceptance remain deferred.

After readiness, an optional five-minute editor-benefit pilot uses three matched cases: conditional charity, correct quotation with a contradicted inference, and unavailable narration. Counterbalance manual-first versus tool-first review between participants and vary case order. Record citation errors, missed conditions, false endorsements, abstentions, completion times and unfinished tasks. Report participant/task counts and individual outcomes; no measured impact score is currently claimed.

## Repository and operating instructions

The [public repository](https://github.com/smaq777/Basira-Hackathon) exposes the source and merge history. Use [requirements](../product/REQUIREMENTS.md), [system blueprint](../architecture/SYSTEM_BLUEPRINT.md), [provider registry](../api/PROVIDERS.md), [test strategy](../testing/STRATEGY.md) and [rights policy](../governance/RIGHTS.md) to inspect scope and trust boundaries. The [alignment page](ALIGNMENT.md) lists the supplied final judging weights.

For credential-free software checks, install Node 24 and npm 11, then run:

```bash
npm ci
npm run check
```

Local hosted database/provider operation is a separate operator setup described in [setup](../operations/SETUP.md) and [credentials](../operations/CREDENTIALS.md). Guests never supply service credentials. Do not send judges team tokens, private drafts, conversation transcripts or local environment files. Production promotion and final portal submission require separate recorded acceptance.
