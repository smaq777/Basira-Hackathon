# Arabic report and input refinements

Related to #14 and #16, continuing draft PR #59. The owner approved the existing
result layout and requested clearer comparisons, classifications and long-text handling.

## Delivered behavior

- Use the requested `نقل مطابق` label. Historical source-only reports explicitly
  say the semantic stage did not run; unavailable and not-applicable states remain distinct.
- Show a green reference card and a pale-red draft card only for a bound wording
  difference. Mark unique, validated raw words on both sides. Legacy differences
  have no individual offsets, so repeated or ambiguous words stay explained in
  the differences list without guessed highlights. Selecting another candidate
  suppresses the original source's verdict, extent and differences.
- Display the original-text footer legend, sharing the editor's Quran, hadith,
  isnad and reference colors. Type coloring defaults on; author prose stays plain.
  Color describes type, not authenticity. Reports color only their recorded roles.
- Grow the editor to the smaller of 420px or 45% of viewport height, with a 128px
  minimum and internal scrolling. Match overlay content geometry and scroll in RTL.
- Reject an oversized paste as a whole, preserving the existing draft and showing
  Arabic feedback. Enforce the 3,000 UTF-16-unit limit in every document/revision
  API mode, including when the source worker is disabled.
- Show a display-only preview of at most 160 UTF-16 units plus ellipsis, ending at
  a grapheme boundary. Clamp loading previews to four lines; stored input is unchanged.

## Classification and input safety

The initial classifier now scans the full bounded draft independently of the five
demonstration findings. It separates multiple framed quotations, their narration
prefixes and references, preserves nested numeric notes, and recognizes denied
attribution conservatively. At most 80 structural annotations are returned with
an explicit partial-coverage warning. This remains a local cue/software-fixture
classifier, not validation against the real source corpus or a hadith grading.

Preflight no longer trims the original before computing offsets. The client checks
annotation/finding slices against the original and clears stale results immediately
on edits. Delayed responses cannot apply to a different current draft.

React text rendering preserves script-like markup as inert text. Database writes
use bound parameters. NUL, unsupported C0/C1 controls and lone surrogates are
rejected before persistence; Arabic marks, valid emoji, line breaks and literal
markup remain unchanged. No HTML rendering, script execution or user-URL fetching
was introduced. Existing body-size, session/ownership, rate-limit and CSP controls
remain. These targeted checks are not a complete security audit.

## Browser evidence

On the local integrated build, a 2,354-unit synthetic draft produced a 324px editor
in a 720px-high desktop viewport; its 2,190px content scrolled internally. At the
bottom, textarea and overlay scroll offsets both measured 1,866px and their widths
matched. A late Quran cue, hadith matn, isnad and reference were independently colored.
Literal script markup created no script or image elements in the editor.

At the requested 390×844 mobile viewport the editor measured about 380px, with
matching overlay width and no horizontal overflow. The report cards stacked without
horizontal overflow. A 3,001-unit attempted replacement preserved the prior draft
and displayed the limit error. Temporary viewport overrides were reset.

The supplied 2,982-unit writing remained unchanged when submitted. The live loading
preview contained 161 units including ellipsis and measured about 86px high. The
bound 51:57 comparison highlighted the actual changed word on each side. Screenshots
and case outputs are retained outside Git in the local experiment directory.

Independent review caught and repaired candidate-source verdict leakage and a
missing truncation marker on standalone source previews. Acceptance and merge
remain with Saleh; deployment and Neon changes are outside this UI follow-up.

## Software validation

`npm run check` passed on Node 24: 381 tests across 24 files, TypeScript,
51 Markdown files checked for local links, repository policy, formatting and
production build. The approximately 655kB main-chunk size warning is non-failing.
The independent second review confirmed both report repairs without further findings.

## Authorized full-writing model test

The owner explicitly confirmed that supplied writing is non-private and may be
sent to models. The previous payload-permission block is resolved. Local testing
uses the server-only owning OpenRouter credential; deployment defaults remain off.

The first current-UI run of the unchanged 2,982-unit writing reached Luna/low
successfully in 10.924 seconds, then returned `invalid_claims` before assessment.
A captured reproduction found five proposals: two passed every binding check;
the others included a question, overlapped a source quotation delimiter or changed
the original wording. The all-or-nothing validator discarded the two valid claims.

The v1.2 extraction prompt requests concise, verbatim assertion-only clauses.
Independent proposals are now validated separately; all mutually overlapping
proposals are rejected without choosing by model array order. Any rejected
proposal forces a partial result with an explicit limitation. Original-text,
question, quote, source-family and exact-citation guards remain intact. Correctly
paired historical v1.1 reports remain readable without rewriting stored results.
The UI distinguishes unavailable extraction from a partial assessment and keeps
source results visible. Independent review found no further issues in this repair.

One bounded retest extracted five valid claims in 6.372 seconds, but Sol/low
assessment reached the unchanged 12-second request limit (12.007 seconds).
It preserved the five bound claims and withheld all verdicts. This establishes
an extraction improvement on this case, not semantic accuracy or model reliability.

A separately recorded latency experiment replayed the exact assessment request
with a 60-second external timeout. It returned HTTP 200 in 32.694 seconds; offline
replay through the production validators accepted five assessments and seven exact
source-family citations. One was supported and four abstained for insufficient
context. Replay-validation durations are not live-provider latency. Two explanations
reported missing pronoun antecedents that were present in the original draft but
absent from the isolated assessment packet.

The v1.3 assessment packet therefore includes the unchanged, bounded original draft
as untrusted author context, solely to resolve references and scope. It remains
separate from source evidence and does not add claims or authorize citations to
the author's writing. The measured latency motivates a 12-second extraction limit,
45-second assessment limit and 60-second phase cap. The local pilot uses a
90-second review deadline. The worker still respects remaining review time and
reserves five seconds for persistence; production flags remain off and the default
review deadline is unchanged. These are experimental budgets, not a latency SLA.

The final current-UI v1.3 reanalysis completed in 49.273 seconds, including source
retrieval and persistence. Original text and input hash were unchanged; all 12
quotation findings and 31 source rows remained. Luna extraction took 8.324 seconds;
Sol assessment took 17.815 seconds. Four selected claims were assessed, with one
`supported` and three `insufficient_context` findings, five validated citations and
no semantic error. The previously omitted pronoun antecedent was correctly used in
the supported claim. The overall report remains partial because unresolved source
coverage is independent of completing the selected semantic claims.

The browser displayed the persisted findings, explanatory scope and attributable
source passage. This single run does not establish claim-extraction coverage,
semantic accuracy or timing reliability; the extractor selected four claims in this
run versus five in the preceding frozen experiment. Further representative,
reviewer-labelled evaluation and improved context retrieval remain priorities.

Final independent review found a timeout-override edge: an override could increase
extraction beyond its 12-second stage cap. Overrides now only shorten each stage's
limit, with regression coverage. This does not change the default timing used in
the successful UI run.

Final `npm run check` passed: 398 tests across 24 files, TypeScript, documentation
links, policy, formatting and build. The non-failing main-chunk warning remains.
