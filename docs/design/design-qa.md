# Design QA — Issue #25

Date: 2 October 2026

## Compared references

- `screen-01-home.jpg` against `/#/home`
- `screen-03-result.jpg` against `/#/result`
- `screen-04-unresolved-voice.jpg` against `/#/unresolved` and the evidence-bound voice drawer
- `screen-05-ticket.jpg` against `/#/ticket`
- `screen-02-automatic-analysis-reference.jpg` as a layout reference only; its manual dropdown classification is intentionally replaced by `/#/analysis`

The source and local home screens, then the source and local result screens, were rendered together in the same browser comparison surface at desktop size. The implementation preserves the reference hierarchy, RTL composition, navy/teal palette, quotation-versus-support separation, evidence context and restrained card treatment. Larger display typography and an added scope eyebrow are intentional readability refinements.

## Browser validation

- Public home, sample loading, automatic analysis, resolved result and evidence-bound voice drawer completed in the in-app browser.
- Reviewer dashboard, queue, search-driven empty state, loading state, recoverable error and retry completed.
- Desktop and narrow mobile layouts showed no horizontal overflow. The reviewer sidebar converts to bottom navigation on mobile.
- Keyboard focus begins on a visible outlined control; form labels and navigation landmarks are exposed to accessibility APIs.
- A clean browser tab reported no console errors or warnings.
- `prefers-reduced-motion` disables non-essential animation and smooth scrolling.

## Findings and fixes

1. **P1 behavior — fixed:** a same-route query-string change did not initially rerender the reviewer error state. Route state now tracks the complete hash, and retry visibly restores the queue.
2. **P2 navigation — fixed:** public header links previously changed the hash router. They now scroll to the relevant page sections without changing routes.
3. **P2 mobile navigation — passed:** the reviewer sidebar would consume excessive width on a phone, so it becomes a labelled bottom navigation bar below 720 px.
4. **P2 copy/scope — passed:** dummy reviewer data, non-live verification and no automatic publication are stated in the interface.

No open P0, P1 or P2 findings remain.

**final result: passed**

---

# Design QA — Issue #36

Date: 3 October 2026

The optional voice drawer preserves the approved unresolved-result reference while removing the unreliable timed microphone mock. It now opens only after an explicit user action, presents the Arabic greeting as both speech and text, and keeps every answer within the active review result and displayed source.

## Browser validation

- Desktop and narrow mobile layouts passed with `VITE_SESSION_VOICE_ENABLED=true`; the drawer remained inside the 480 CSS-pixel test viewport with no page-level horizontal overflow.
- The Arabic greeting played, its complete transcript remained visible and the interface announced when speech finished.
- A typed source question returned only Al-Baqarah 2:271 and explicitly stated that no other source was being used.
- The live browser shell accepted a microphone start call without returning a start or error event. The implementation now shows a pending-permission state immediately and converts a missing callback into a recoverable error after five seconds. Automated tests also cover unsupported and permission-denied paths.
- Closing the drawer stops recognition and speech. Live regions expose listening, error and speech-output status without relying on color.
- Non-essential drawer and microphone animation uses the existing reduced-motion override.

No open P0, P1 or P2 interface finding remains. Premium-provider quality and a real-device Arabic microphone pass remain research work, not a release claim.

**final result: passed for the browser-native proof of value**

---

# Design QA — Issue #35

Date: 3 October 2026

## Compared reference

- `screen-03-result.jpg` against `/#/result`
- Desktop implementation capture in the Codex in-app browser at the default viewport
- Responsive implementation capture with a 390 × 844 device viewport override (780 CSS-pixel capture after browser scaling)

The result keeps the approved information order: independent support-sufficiency and literal-transfer cards, followed by source context and a bounded editorial suggestion. The suggested text remains below the evidence cards and offers an explicit full-text copy action.

## Interaction and edge-case validation

- Long and multiline suggestions wrap without horizontal overflow and can be expanded or collapsed with an accessible disclosure control.
- The narrow layout stacks both comparison cards and all source-context sections without horizontal overflow.
- Copying uses the complete suggestion rather than the visually clamped excerpt, confirms success, and gives recovery guidance when clipboard access is denied.
- Suggestion content is rendered as escaped text; HTML-like input is never interpreted as markup.
- Cairo is the computed interface font, with Tahoma and Arial as local fallbacks.
- The current page rendered without a live console error; the only captured error was an earlier resolved Vite hot-reload message from before the final render.

## Findings and fixes

1. **P1 security — fixed:** untrusted suggestion content now has a regression test proving that HTML-like text remains inert and escaped.
2. **P2 long content — fixed:** long suggestions now have safe wrapping, a four-line preview and an accessible full-text expansion control.
3. **P2 clipboard recovery — fixed:** success and denial states are announced, and denial preserves the visible text for manual selection.
4. **P2 mobile layout — passed:** the comparison cards, source context, suggestion and actions stack without page-level horizontal overflow.

No open P0, P1 or P2 findings remain.

**final result: passed**
