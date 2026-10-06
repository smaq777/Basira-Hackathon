# Selected homepage cleanup

Related to #196. The user selected three precise staging homepage areas before submission.

The composer inspection-status legend (`دليل حالة الفحص`) is removed. Content-type chips, their explanation, draft highlights, classification warnings and report findings are preserved. The `يمكنك البدء كضيف.` hint and its adjacent icon are removed; the example action and guest session behavior remain.

All challenge-partner heading and link text is unchanged. Its existing duplicated scrolling logo row moves into the blue trust band, above the three existing challenge marks. The original left-to-right 26-second loop, hover/focus pause, duplicate accessibility handling and reduced-motion behavior are unchanged. Existing image URLs and alternative text are retained; the moved logos render in white through CSS for contrast on the blue background. No image assets are rewritten.

Verification uses the existing homepage tests, required repository checks and a local desktop browser inspection. No provider calls, API/RAG/database changes or deployment actions are included. Owner acceptance and guarded staging deployment are separate. Rollback is a revert of this UI change.

On 6 October, 29 focused homepage tests passed. Full `npm run check` passed: typecheck, 1,100 tests plus one existing skip across 78 files, documentation checks across 125 Markdown files, policy, formatting and build. The existing Vite bundle-size warning remains.

Local browser inspection confirmed the original partner heading/link text, no logo row inside the heading section, one scrolling row inside the blue band, the three existing challenge marks, and successful loading of every logo image. The computed partner animation remained `26s linear infinite partner-logo-loop`. The removed guest hint and inspection legend were absent. This static local inspection does not establish live deployment or API acceptance.

## Owner-requested unified logo row

Saleh’s follow-up on PR #197 replaces the two blue-band rows with one seven-logo marquee: the four partners and three challenge marks share one non-wrapping track, the original 26-second left-to-right loop and the official challenge link. Every logo uses a contained 160 × 64 px image box on desktop and 130 × 52 px on mobile. The former logo-specific sizing and separate challenge drift are removed. Original assets and aspect ratios are preserved.

Hover and keyboard focus pause the row. Reduced-motion CSS disables its animation, hides the duplicate group and allows horizontal scrolling to reach every logo. Local browser readback confirmed seven loaded images, matching image boxes and the same vertical coordinate; the track transform changed over time. The existing homepage test now covers all seven originals, the hidden duplicate and the official link. Node 24 `npm run check` passed: 1,100 tests, one existing skip, typecheck, docs, policy, format and build; the existing bundle-size warning remains.

Saleh accepted the localhost presentation and explicitly requested Railway staging deployment, excluding a Vercel deployment. Live deployment receipt and staging visual readback are recorded on issue #196 after integration; this file does not claim them in advance. Rollback is reverting the UI commits and deploying the reverted development revision to the same staging service.
