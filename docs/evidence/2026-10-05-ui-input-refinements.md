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
