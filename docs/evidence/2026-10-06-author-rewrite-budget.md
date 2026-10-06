# Supported-author budgeting and failure diagnosis

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157).
Scope: supported-author rewriting; no corpus, quota, migration, email,
reviewer-publication or production changes.

## Observed evidence and limits

Owner staging evidence retains two supported-author charity suggestions that
failed validation and exposed no copyable output. The historical provider
operations and verifier responses are unavailable in this checkout. Their exact
causes therefore remain unknown; no prompt or model change is inferred from them.

A new frozen diagnostic used the already completed semantic 1.13 report
`28ace029-a42b-46aa-aec0-495167ff4a8e`, containing the committed synthetic charity
acceptance fixture and three attributed public Quran/Tafsir originals. The exact
claim remained eligible. The first generator request returned HTTP 403 with
`Key limit exceeded (total limit)` for the owning Foundation key. No operations
were generated and no verifier request ran. The key, quota and provider model
were not changed or retried. This is a fresh provider-availability failure, not
a reconstruction of the historical validation failures.

The first execution request was rejected by automatic approval review because
the payload was classified as a private report. The same execution path was
approved after proving and enforcing that the original equals the committed
synthetic fixture, every evidence entry has the public Quran/Tafsir URL, and the
outgoing model packet contains no report/revision/session/account UUIDs. The
initial rejection and subsequent first actual outcome remain retained outside
Git under `author-rewrite-diagnostic-2026-10-06`. Credentials, authorization
headers and provider management URLs are excluded from those receipts.

## Reproduced deterministic defect

Separate offline regressions exposed an actual length-accounting defect:
`validateAuthorRewrite` applied the insertion-only budget to the original length
before accounting for author replacements. A shorter candidate could discard a
recorded citation that would fit. A longer candidate could keep an optional
citation under the old budget and then reject the whole candidate as oversized,
although the changed author text alone fit.

Both regressions failed against the original implementation: missing retained
citation in the shortening case and `REWRITE_INVALID_CANDIDATE` in the expansion
case. They now pass through a shared insertion validator using the server-owned
replacement length delta. Immutable original binding, allowed offsets, exact
source keys, protected quotations, duplicate/overlap checks and the final
3,000 UTF-16 unit limit remain enforced. Optional additions that do not fit are
omitted with the existing budget notice. Every original character outside the
selected author spans is retained; copy reconstructs the same budget.

The suspected empty-layout failure was ruled out: empty layout operations are
already valid, and a nonempty author replacement satisfies the hosted useful-
change gate. This change does not relax that gate or convert unsupported text
into an attributed candidate. These deterministic length defects do not explain
the historical short charity failure without its missing provider receipts.

## Privacy-safe first-failure capture

The optional server flag `FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS=true` records
only strict fixed failure stages/reasons and SHA-256 hashes of the bound input,
evidence state, generated operations and verifier packet. For example, it can
distinguish `candidate_validation / original_text_binding` from
`verification_validation / scope_changed`. It stores no author/source text,
replacement, citation excerpt, model response, credentials, account/report IDs
or arbitrary error messages. It defaults off. Invalid receipt fields are
rejected, and observer failures cannot change validation or withholding.

After the accepted staging build is deployed, Saleh may enable the flag for one
fresh owned supported-author attempt, retain its first receipt alongside the
report, then turn it off. Generation and independent verification use the same
existing key and model; there is no automatic retry, fallback or quota change.
The receipt narrows the exact failure stage without exposing content. A fresh
useful author improvement and exact UI copy remain necessary for live acceptance.

## Validation and rollback

The final Node 24 full check passed: 913 tests in 65 files, type checking,
107 documentation files, repository policy, formatting and production build.
The focused author and diagnostic-privacy run passed 27 tests. Coverage
includes the two red-to-green length regressions, fresh-copy reconstruction,
exact verifier failure classification, generator/binding failure distinction,
default-off logging, strict rejection of extra text/credentials/identifiers,
observer failure containment and the existing preservation/ownership/cancellation
controls. Explicit cancellation, owner cancellation and service shutdown produce
no misleading deadline receipt; a real timeout produces one deadline receipt
and withholds text. Software checks do not establish scientific accuracy or
live readiness.

Rollback: disable the optional diagnostic flag; revert this bounded budgeting
change if necessary. Disabling the existing staging rewrite flag withholds the
feature entirely. Source approval, original report persistence and production
remain unchanged.
