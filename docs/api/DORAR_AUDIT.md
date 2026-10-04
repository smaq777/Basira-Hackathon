# Dorar API assessment

Assessment context: owner-supplied API PDF and two legacy JavaScript/PHP ZIP examples; development-network probes performed during 30 September 2026 preparation. This is a bounded access assessment, not an uptime study.

## Observed behavior

The supplied examples target `https://dorar.net/dorar_api.json` with a search parameter. Nine sampled GET requests spanning meaningful searches, a nonsense query and plain/JSONP/browser-style variations returned **HTTP 403 with HTML challenge/block content**. Observed GET durations were approximately 0.29–0.58 seconds. Additional legacy/protocol checks also did not produce a usable JSON payload.

These results establish that the tested access path was unusable from that environment at that time. They do **not** establish global downtime, account invalidity, service-level reliability, or how requests behave from a different authorized origin. A logged-in browser session does not automatically confer server-to-server API access.

## Static example review

- The materials describe differing response-access patterns, including a `th` field and an `ahadith.result` path. Without a successful live payload, the production schema remains unverified.
- Legacy JavaScript examples use an old jQuery dependency. Do not copy their client-side rendering or dependency choices into the product.
- The PHP archive is a client example, not evidence of an independent PHP-only API or a separate fallback service.
- PHP examples were statically inspected; no claim is made that they were executed successfully.
- Provider-returned markup must be parsed safely, preserving attribution while removing executable content.

## Decision

Keep live Dorar integration disabled until approved access and schema tests succeed. Do not build the hackathon demonstration around an unverified dependency. Never work around a challenge by spoofing identity, scraping authenticated sessions or bypassing access controls.

Contact route from the supplied document: **support@dorar.net**. Reference site: [Dorar](https://dorar.net/). Ask for the current supported endpoint, authentication method, allowed origin/IP policy, rate limits, schema, caching/redistribution terms and service expectations. No access-request email has been sent on the owner's behalf.

A Railway static outbound IP, if available on the selected plan, can support an approved allowlist. It is not a guarantee that blocked access will be accepted.

## Release gate

Record successful permitted calls, exact schemas, controlled failure behavior and a rights-approved fallback. Repeat a small scheduled sample over the intended deployment network before reporting any reliability percentage. Until then, describe hadith coverage as a bounded approved-reference capability, not comprehensive live verification.
