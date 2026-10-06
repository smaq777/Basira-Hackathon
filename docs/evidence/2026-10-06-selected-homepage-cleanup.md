# Selected homepage cleanup

Related to #196. The user selected three precise staging homepage areas before submission.

The composer inspection-status legend (`دليل حالة الفحص`) is removed. Content-type chips, their explanation, draft highlights, classification warnings and report findings are preserved. The `يمكنك البدء كضيف.` hint and its adjacent icon are removed; the example action and guest session behavior remain.

All challenge-partner heading and link text is unchanged. Its existing duplicated scrolling logo row moves into the blue trust band, above the three existing challenge marks. The original left-to-right 26-second loop, hover/focus pause, duplicate accessibility handling and reduced-motion behavior are unchanged. Existing image URLs and alternative text are retained; the moved logos render in white through CSS for contrast on the blue background. No image assets are rewritten.

Verification uses the existing homepage tests, required repository checks and a local desktop browser inspection. No provider calls, API/RAG/database changes or deployment actions are included. Owner acceptance and guarded staging deployment are separate. Rollback is a revert of this UI change.

On 6 October, 29 focused homepage tests passed. Full `npm run check` passed: typecheck, 1,100 tests plus one existing skip across 78 files, documentation checks across 125 Markdown files, policy, formatting and build. The existing Vite bundle-size warning remains.

Local browser inspection confirmed the original partner heading/link text, no logo row inside the heading section, one scrolling row inside the blue band, the three existing challenge marks, and successful loading of every logo image. The computed partner animation remained `26s linear infinite partner-logo-loop`. The removed guest hint and inspection legend were absent. This static local inspection does not establish live deployment or API acceptance.
