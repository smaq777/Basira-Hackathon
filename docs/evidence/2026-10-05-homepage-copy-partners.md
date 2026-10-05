# Homepage copy and challenge-partner presentation

Issue #112 applies the seven owner-marked homepage corrections without changing
the review flow or source-policy boundary.

- The guest message no longer claims a 24-hour draft-access expiry.
- The benefits heading is shorter and uses a focused size so it remains on one
  line at the reviewed desktop width while wrapping at narrow mobile widths.
- FAQ answers now state the non-fatwa/human-review boundary, explain that every
  result displays its actual reference and limitations, and describe ticket
  lookup with the retained reference number.
- The footer explains public source categories without disclosing API, MCP,
  credential or database configuration.
- The continuously moving logo strip is labelled **challenge partners**, not
  Basirah partners. It links to the official challenge partner section and uses
  the four official remote assets for the Ministry of Communications and
  Information Technology, SDAIA, Technical Transformation Company and Future
  Frontiers. No new third-party logo files are copied into the repository.
- Animation pauses on hover and follows the existing reduced-motion rule.

## Verification

- `npm test -- apps/web/src/App.test.tsx`: 29 tests passed.
- `npm run check`: 55 test files and 755 tests passed, followed by successful
  type-check, documentation, policy, formatting and production-build checks.
- Browser QA at a 2560px desktop viewport and a 667px mobile viewport confirmed
  that all four source images load, the benefits heading remains on one line,
  the logo track runs its 26-second continuous animation, and the page has no
  horizontal overflow or browser console warnings/errors.
- The Ministry asset loads at 2188 x 600 pixels. The other three assets are
  official SVGs and retain their vector quality at responsive sizes.

The wording remains evidence-bounded: displaying a source does not establish a
fatwa, final approval, source-edition approval or scholarly correctness.
