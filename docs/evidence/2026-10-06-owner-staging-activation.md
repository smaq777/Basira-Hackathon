# Owner staging activation and first outcomes

Related to [#162](https://github.com/smaq777/Basira-Hackathon/issues/162)
and follow-up [#165](https://github.com/smaq777/Basira-Hackathon/issues/165).

Owner-authorized staging activation merged PR163 and the corrected operator
runbook PR164. Development `1147145b4e716584a6f944d8418c6b827a54f9bf` passed
remote CI and Railway deployment `1a68897f-f154-43d4-a4fe-7cfb1683c77f`
reached SUCCESS. Health/readiness returned200, migration0018, with scholarly
verification correctly false. This is an intermediate acceptance receipt, not
a claim that the later refinement is deployed or accepted.

The actual staging reader previously targeted the86-only quiet preview. The
owner retargeted only the reader to the existing verified research endpoint and
pinned175. TLS, report/worker identities and provider flags were preserved.
No embeddings, schema/grants, source approvals or production changes occurred.
The curator remains on the old preview; source publication is unavailable under
the existing same-database safety guard. Report editing is independent, and
reviewer/publication/email acceptance remains deferred.

First live semantic run: four of six selected checks passed. Supported and
contradicted negation/condition cases retained exact input,175 corpus, semantic
1.11, durable reload and anonymous401. The wedding-feast case selected30:21
marriage-companionship evidence and returned not_established: its relevance gate
was too permissive about shared entities. Off-topic selected no evidence and
returned not_applicable: the acceptance harness incorrectly required no extracted
claim. First reports remain in ignored
`test-results/submission-acceptance-2026-10-06T09-48-55.003Z`; they were not retried
or overwritten to manufacture a passing result.

UI first outcomes: faithful Quran7:31 generated exact recorded attribution in
citation-only mode, preserving the quotation and copying exact validated text.
The user's unreferenced2:271 altered excerpt marked لهم against لَّكُمْ and
withheld suggestions. A supported-author charity rewrite failed its preservation
checks and correctly exposed no candidate/copy, leaving the original untouched.
This is safe rejection, not a successful author rewrite.

Follow-up1.12 requires relevance to the asserted core action/proposition rather
than any shared entity or thematic qualifier. Both normal and gap-retrieval
relevance stages use the assessment model, with the existing deadline/fail-closed
controls unchanged. Historical1.11 reports remain readable. Off-topic acceptance
permits empty findings or explicit not_applicable only, never evidence/citations.
Fresh post-deployment receipts and remaining UI acceptance belong on issues162/165.
No benchmark accuracy or expert approval is inferred from these engineering checks.
