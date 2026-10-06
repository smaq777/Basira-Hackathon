# Desktop report and copy clarity — 6 October 2026

Related to [#169](https://github.com/smaq777/Basira-Hackathon/issues/169).
This is a narrow desktop usability follow-up on accepted development PR186 merge
`f29b3145c0b5a0b6af888fe79c060f91b1fcdfdb`. It makes no deployment claim for the
branch's UI changes. Current staging acceptance and deployment identity remain
in the owner's dated issue receipts; historical failures remain recorded.

## Findings and changes

Existing report verdict labels already distinguish contradicted claims,
insufficient context and incomplete AI assessment. The source library's generic
empty message did not explain those differences when no sources were displayed.
Its new Arabic notice distinguishes absent displayed evidence from interrupted
retrieval or assessment. The retrieval notice uses the existing precise limitation
so a source-selection omission is not mislabeled as a provider outage. Absence of
evidence is never a false-content or narration-authenticity verdict.

When Quran text is present without Tafsir, the report explicitly says Tafsir was
not included and retains the Quran source. A zero Tafsir count alone does not
diagnose database, API or MCP failure. These notices change presentation only;
they do not alter source originals, findings, report status or source approval.

The existing rewrite comparison, cancellation and original-retention controls
already cover the requested journey. The copy action lacked pending feedback and
allowed repeated requests while waiting. It now shows progress and disables
copy/generation until the actual clipboard operation settles. Success is announced
only after fresh server validation, exact text equality and clipboard success.
Clipboard rejection restores the action and keeps the original intact. Existing
late-copy, report-replacement and cancellation guards remain.

[Deployment instructions](../operations/DEPLOYMENT.md) now describe real owned
reports and the separate Neon corpus instead of presenting the historical shell's
`501` and dummy output as current behavior. They distinguish gated GitHub workflows
from Railway's separate auto-deploy, require an accepted source/declaration match
before deployment, and preserve staging/service/TLS guards. No workflow or hosting
configuration changed in this branch.

## Validation and remaining QA

Offline `npm run check` passed on Node 24/npm 11: 76 files, 1,080 tests passed and
one skipped, plus type checking, documentation links, policy, formatting and the
production build. Six focused UI regressions cover empty evidence, failed
assessment/search, missing Tafsir, pending copy and clipboard rejection. Existing
late-copy/cancellation/report-replacement controls still pass. The build retains
the existing client chunk warning over 500 kB; bundle redesign is outside scope.

Owner review and desktop browser QA remain before merging/deploying these UI
changes. Hold further development merges during the owner's acceptance window.
After deployment, inspect the new notices on empty and Quran-only reports and
verify copy success/failure feedback in the intended browser. This branch performs
no paid provider calls, database mutations, hosting changes or production promotion.

## Evaluation limits

No manual editor baseline or actual human Arabic review was collected during the
hackathon. The prepared evaluation framework is for future use after qualified
reviewers are recruited. Software checks and selected demonstrations prove neither
time savings nor human-rated output quality. Mobile, reviewer/publication and
presentation remain deferred from this follow-up.
