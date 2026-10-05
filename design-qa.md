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
