# Session-grounded Arabic voice companion

**Status:** optional proof of value behind `VITE_SESSION_VOICE_ENABLED`; not a general assistant or a production speech-provider integration.

## Purpose and boundary

The voice companion gives a spoken Arabic explanation of the review already visible on screen. It can explain the displayed result, source, limitation and proposed editorial wording. It cannot add sources, issue a fatwa, answer a general religious question, create a new verdict or change a saved review.

Every assistant response is also rendered as text. The current proof of value uses browser speech synthesis and browser speech recognition when available. No audio, transcript or review content is sent to an external speech provider by this implementation.

## Behavior

- Opening the drawer shows and speaks a short Arabic greeting.
- Arabic browser voices are preferred; the interface remains fully usable as text if speech output is unavailable.
- The microphone control has explicit idle, listening, processing, permission-denied, unsupported and error states. Pressing it again stops an active capture.
- Recognized text is answered using deterministic, session-scoped response categories: source, result limitation, editorial suggestion or out-of-scope refusal.
- Closing the drawer stops recognition and speech playback.
- The unresolved result does not open the drawer automatically, which avoids unexpected audio and preserves user control.

## Enable and rollback

Set the public browser variable `VITE_SESSION_VOICE_ENABLED=true` only on a deployment selected for evaluation. It is disabled by default. Setting it to `false` removes the voice entry points without changing review data or other result-page behavior.

This variable is not a secret. Never put an API key in any `VITE_*` value.

## Provider evaluation

A premium speech provider may improve Arabic voice quality, but it would add network latency, cost, disclosure and data-processing obligations. Before connecting one, record its data retention, regional processing, consent language, timeout behavior and text-only fallback. Provider credentials must stay server-side. Ahmed owns that future API/provider lane; the browser fallback remains the reliability baseline.

## Acceptance evidence

- Unit tests cover the Arabic greeting, source-bounded answers, distinct resolved/unresolved explanations and out-of-scope refusal.
- Interface tests cover visible transcript, unsupported microphone recovery and typed out-of-scope questions.
- Final browser QA must be performed on desktop and narrow mobile with the flag enabled, including permission denial and reduced-motion behavior where the browser permits it.
