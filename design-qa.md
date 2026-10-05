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
