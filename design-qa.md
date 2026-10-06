# Design QA

## Issue #118 — mobile analysis failure card

**Final result: PASSED**

- Target evidence: the owner-provided 667px-wide staging screenshot showed the
  failure explanation compressed to roughly one word per line beside two action
  buttons.
- Local verification: rendered the unavailable-analysis state at 667 x 1300 and
  390 x 1600 using headless Chrome.
- The warning, explanation and retry action now stack in a clear RTL hierarchy;
  the action spans the card width and the Arabic explanation uses the available
  line length.
- The 1440 x 1000 desktop rendering retains the existing horizontal card layout.
- No component, copy, result semantics or animation behavior changed.

Targeted checks:

- `npm run test -- apps/web/src/App.test.tsx` — 29 tests passed.
- `npm run format:check` — passed.
- `npm run typecheck` — passed.

## Issue #127 — three-step review flow and partner marquee

**Final result: PASSED**

- Replaced the six-card capability grid with the approved three-step sequence:
  add the text, review the evidence and improve the phrasing.
- Desktop verification at 1440px keeps the three steps in one balanced row with
  clear dividers and a separate usage-limit note.
- Mobile verification at 667px stacks the same three steps in reading order
  without horizontal overflow or compressed Arabic copy.
- The four partner marks from the official challenge site render in one
  non-wrapping animated row immediately above the navy challenge strip.
- The animation remains pausable on hover/focus and the global reduced-motion
  rule disables continuous movement for users who request it.

Evidence:

- `basirah-three-steps-desktop-delay.png` — desktop homepage and footer.
- `basirah-three-steps-mobile-delay.png` — mobile homepage and footer.

Targeted checks:

- `npm run test -- apps/web/src/App.test.tsx tests/api-foundation.test.ts` — 51 tests passed.
- `npm run format:check` — passed.
- `npm run typecheck` — passed.

## Issue #145 — navigable result evidence workspace

**Final result: PASSED**

- Reference: `/var/folders/f2/8c_vrn9j3b3g22m4jc85br6m0000gn/T/codex-clipboard-059e9eb5-41cd-46a9-b9a1-01ea0b545fc2.png`.
- In-app Browser verification confirmed the selected desktop hierarchy: section navigator, comparison counts, draft/reference cards, difference analysis, original text and compact disclosures.
- A 480-CSS-pixel responsive check stacked the draft/reference cards and reported no horizontal document overflow.
- Clicking a navigation item opens collapsed content, scrolls it into view, updates `aria-current` and applies a short destination highlight.
- Existing source roles, filters, comparison fidelity, excerpt limits, semantic assessment, rewrite and human-review actions remain driven by the persisted report data.

Verification:

- `npm run test -- apps/web/src/foundation-report.test.tsx apps/web/src/rewrite.test.tsx --reporter=dot` — 67 tests passed.
- `npm run check` — 815 tests, documentation, policy, formatting and production build passed.

### Live comparison follow-up

final result: passed

- Same owner-selected reference; extended the workspace only where the persisted report supplies additional functionality.
- The right-side RTL navigator, blue draft header, green reference header, three counts and inline word differences were compared side by side with the reference.
- Added an always-visible evidence-assessment section because the live report's actual claim assessment was hidden inside collapsed context.
- A claim citation now opens the exact claim and the exact cited excerpt together. This is semantic evidence, not a fabricated literal match or generated correction.
- Multiple literal findings can be selected directly above the comparison cards. Full-text source reading keeps the draft card visible.
- Local browser proof: `/tmp/basirah-result-proof/reference-comparison.jpg` and `/tmp/basirah-result-proof/mobile-comparison.jpg`.
- Responsive proof used an isolated 480px iframe browsing context; document client width and scroll width were both 450px after its scrollbar. Both cards were 422px wide and stacked in reading order.
- Source navigation opened its disclosure, updated `aria-current` and applied the destination pulse.
- The labeled local fixture verified word-difference rendering only. Separately, the real staging API completed a quotation-plus-claim review and restored it after reload; no fixture was deployed.
- Full Node 24 check: 816 tests, type checking, documentation, policy, formatting and build passed. Staging deployment acceptance is recorded separately on Issue #145.
