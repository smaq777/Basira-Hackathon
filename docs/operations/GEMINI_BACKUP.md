# Direct Gemini text backup

**Implemented behind a default-off flag; deployment acceptance pending.**
Related to [issue #176](https://github.com/smaq777/Basira-Hackathon/issues/176)
and [assessment routing](https://github.com/smaq777/Basira-Hackathon/issues/13).
This adds provider availability backup, not model voting or scholarly approval.

## Routing and preserved checks

OpenRouter remains primary for extraction, relevance, evidence assessment and
author rewrite generation/independent verification. When the enabled primary
transport returns access/capacity errors (401/402/403/429), server errors, network
failure or a bounded transport timeout, the affected stage may use the direct
Google Gemini API with pinned `gemini-2.5-flash`. It does not call Gemini through
OpenRouter. The existing prompts, frozen evidence, server JSON contracts, source hashes,
quotation and author-preservation checks still apply.

Google rejected the original nested bounded assessment schema with HTTP 400
(`INVALID_ARGUMENT`: too many decoder constraint states). Its generation schema
therefore retains JSON shape, types, enums, required fields and closed objects,
while leaving length, array-count, numeric and pattern bounds to the unchanged
full server Zod contracts. Every response still passes those full contracts;
this compatibility change never expands accepted output.

Invalid model identity, malformed output, refused/incomplete content, invalid
citations, disagreement and failed preservation checks do not earn another model
answer. Cancellation and the existing overall deadline stop every attempt.
Backup-enabled primary attempts reserve time for recovery; time ceilings are not
reset. The semantic run keeps the chosen backup route for subsequent stages.
Rewrite generation and verification remain separate requests inside their shared
90-second task ceiling.

At most one request per distinct configured Gemini key is allowed for a stage
after eligible transport failure. If the first Gemini transport fails, the
second configured key may be used within the remaining time. A successful but
invalid answer is terminal. There is no loop over keys or repeated same-key
retry. Independently supplied account capacity does not establish uptime or
successful future requests.

Semantic traces retain failed OpenRouter attempts and the actual Gemini
model/Google supplier, request/response hashes, token usage and fallback marker.
Google does not provide an invoice cost in this response; unknown cost stays
unknown. Credentials and raw provider errors never enter reports or public logs.

## Existing corpus and acquisition

Neon, its 175-passage corpus, source approval states and OpenAI
`text-embedding-3-small`/1536-dimensional vectors remain unchanged. The backup is
for text model tasks; it cannot generate compatible replacement query vectors
with a different embedding model. Existing exact/lexical retrieval remains
available when query embedding fails. Missing or unrelated evidence still
requires abstention. MCP/source acquisition keeps its existing separate paths.

Optional page/topic classification is outside this text backup path and retains
its configured OpenRouter route. Do not advertise complete removal of the
OpenRouter dependency.

## Saleh-owned activation

1. Accept the change, run CI on the actual development merge SHA, and deploy that
   SHA through Saleh's existing Railway staging process. Keep the existing
   deployment service/ref/SHA, database-role and corpus pins; no migrations,
   credential rotation or production activation are included.
2. In Railway's private runtime variables, configure `GEMINI_API_KEY` and,
   optionally, `GEMINI_API_KEY_2`. Never paste secrets into an issue, PR, command
   output or tracked file. The first configured key is primary; if only the
   second is present it becomes the sole backup key. Duplicate keys are deduplicated.
3. Set `FOUNDATION_GEMINI_BACKUP_ENABLED=true`. It defaults to false; an enabled
   flag without a key rejects startup. Hosted production activation is rejected.
   A local Foundation `.env` is not automatically loaded by Railway.
4. Verify the accepted revision, `/health` and `/ready`. Run one scoped synthetic
   supported case and exact rewrite/copy checks, retaining first outcomes. A
   failed new Railway deployment or healthy old build is not acceptance of this
   feature. Do not inject a shared OpenRouter outage for a demo; a controlled
   local transport fixture can verify failure routing without changing live keys.

Google documents the [native generation API](https://ai.google.dev/api/generate-content)
and [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
Provider-side JSON formatting does not replace server-side validation.

## Rollback and remaining evidence

Turn `FOUNDATION_GEMINI_BACKUP_ENABLED=false` through Saleh's staging controls to
restore the primary-only route. A reviewed application rollback follows the
existing merge/deployment procedure. Original reports and source data remain
unchanged. Reviewer/publication, mobile design, Render provisioning and
presentation work are deferred.

Offline provider fixtures verify routing and withholding, not model accuracy or
account capacity. Live model/key metadata and any bounded real-generation
receipts must be recorded separately before claiming working direct backup.

On 6 October 2026 at 15:45 Riyadh, a controlled local acceptance run injected
OpenRouter HTTP 403 in the test transport and made five real direct Google
requests for a newly authored synthetic rights-preservation example. All five
returned HTTP 200 with actual `gemini-2.5-flash` identity: extraction, relevance,
assessment, author generation and independent verification. The assessment was
completed with a supported citation; the author replacement retained its
exception, included attribution and passed exact server copy. The first
schema-rejected outcome is retained separately. Both configured keys passed
read-only pinned-model access checks; real generation used the first key.
These checks do not establish fresh Neon retrieval, religious correctness,
Railway deployment acceptance or future uptime.

At 15:47 Riyadh, a separate bounded public-source acceptance used the existing
Quran 2:271 charity draft and its frozen Quran/Muyassar/Saadi evidence after the
user clarified that project drafts and sources are public. All five direct
Google stages returned HTTP 200, with completed cited assessment and a validated
author replacement. Exact protected quotation, poor-recipient condition,
attribution and exact-copy checks passed. This reused frozen evidence; it did
not run a new database retrieval or change a shared provider key/deployment.
