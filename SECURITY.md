# Security and privacy

**Status:** baseline engineering controls only; not a production security certification.

Report sensitive findings privately to the repository owner through an existing private channel. Use GitHub private vulnerability reporting if enabled. Do not publish credentials, user posts or exploit details in public issues. No dedicated disclosure email or response SLA has been established.

## Implemented baseline

- Dependency lockfile and CI dependency auditing.
- No committed credentials; an empty secret-field environment template.
- Safe-off deployment flags, environment-scoped credential names and ignored local provider/tool state.
- HTTP `nosniff`, restrictive referrer policy and `no-store` responses in the foundation server.
- Same-origin guest cookies, database-backed ownership checks and row-level security.
- In-process burst limits for guest-session creation and guest mutations, plus database-backed
  caps on documents, revisions and review runs. Provider-edge limits and model budgets remain
  required before production.
- Guest access expires after at most 24 hours. Migration `0005` adds bounded, concurrency-safe
  deletion of expired guest rows and their dependent content whenever a new session is created.
- No active review processing, external fetch endpoint or model tool execution. Reviewer identity is
  Clerk-backed. Production authorization uses an exact server-side user-ID allowlist; the hackathon
  staging demo may temporarily admit any authenticated Clerk user so judges are not blocked. Real
  reviewer data APIs are not implemented yet.
- Contract guards against unknown evidence identifiers and stale document revisions.

## Required before a usable review service

| Threat                             | Required control                                                                                                                                     | Verification                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Guest-session data exposure / IDOR | Cryptographically random session secret; server-side hashed ownership token; Secure, HttpOnly cookie; expiration and authorization on every resource | Cross-session read/write/export/delete tests             |
| Prompt injection in post or source | Treat text as data; fixed schemas and tool allowlist; no model-controlled tool writes                                                                | Malicious-content regression fixtures                    |
| Arbitrary URL fetch / SSRF         | Fixed provider hosts, HTTPS, bounded redirects and response sizes; no user-supplied fetch URLs                                                       | Reject private-address and redirect cases                |
| HTML from providers                | Parse into plain text or vetted safe markup; never render raw provider HTML                                                                          | Stored and reflected XSS tests                           |
| Sensitive logging                  | No raw posts, credentials, cookies or full provider responses in logs                                                                                | Redaction tests and log review                           |
| Cost abuse                         | Provider-edge distributed limits, request timeouts, concurrency limits and model budgets                                                             | Boundary and burst tests                                 |
| Forged citations                   | Approved-source membership, exact reference lookup, edition/version binding                                                                          | Wrong-edition and invented-ID tests                      |
| Cross-origin requests              | Prefer one origin; explicit CORS/CSRF policy if separated                                                                                            | Allowed/disallowed origin and cookie tests               |
| Reviewer authorization             | Clerk token verification plus an explicit policy: production-default allowlist or time-bounded authenticated-only hackathon staging                  | Signed-out, non-allowlisted and authenticated-mode tests |

Guest access expires after at most **24 hours**, and users can explicitly delete the current guest session. Expired primary-database rows are purged in bounded batches on later session creation after migration `0005` is applied. This is not a precise deletion-time guarantee: a verified scheduler is still required for idle periods, and backups need a separately documented retention/deletion policy. Disclose external model processing before submission and avoid collecting names. Do not claim zero retention until verified across every service.

Production data processing remains disabled, and no user dataset is approved. Before making the repository public, inspect the full Git history and third-party content rights; a working-tree scan alone is insufficient. If a credential is exposed, revoke it first, then remove it using an owner-approved history-cleanup plan.

See the [credential and incident guide](docs/operations/CREDENTIALS.md). Local MCP, assistant/editor state, team notes, transcripts, credential folders, provider state directories and common key/certificate formats are ignored. The bounded CI regex is a guardrail, not proof that history is clean.
