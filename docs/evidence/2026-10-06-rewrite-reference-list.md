# Numbered references in rewrite display and copy

Related to #169 and requirement FR-07. This change follows the user's request for the proposed rewrite to end with `References` and a numbered list. Owner acceptance and deployment are separate from these implementation checks.

## Behavior

The server formats the candidate text with numeric citation markers and an ending reference list. The same string is displayed and returned by the freshly validated copy endpoint. Entries come from the report's allowed evidence metadata, never from a model-generated bibliography. A source used by multiple accepted replacements or citation insertions appears once, keyed by its evidence ID. All sources supporting accepted author replacements are included, including sources without an optional inline marker. Unused report sources are excluded.

Illustrative synthetic format, not an Islamic source or acceptance result:

```text
Proposed wording [1]. Another supported statement [1].

References
1. Example source — locator
2. Another source used by an accepted wording change — locator
```

Research sources retain the existing `مصدر بحثي غير معتمد` warning. Neither inclusion in the reference list nor successful rewriting implies scholarly approval. Protected quotations and conditions remain subject to the existing validation and independent verification gates; the original report text is unchanged.

## Length and failure behavior

The existing 3,000 UTF-16-unit candidate limit includes the entire reference list. Mandatory references for accepted author changes are reserved before optional layout and citation insertions. If the mandatory list cannot fit, the candidate is withheld rather than truncating the original or silently dropping its evidence. Optional insertions can still be omitted within the existing budget-limited behavior. No database, provider routing, deployment guard or source-approval changes are included.

## Verification

Focused deterministic tests cover repeated-source numbering, multiple used sources, exclusion of unused evidence, pending-source warnings, unchanged protected text, mandatory-reference overflow, optional-marker budgeting, shorter allowed quotation references after a longer entry cannot fit, and server display/copy equality. A browser-component test checks the complete displayed candidate against the clipboard write, including the heading and numbered entries. Existing ownership, tamper, cancellation, late-copy and clipboard-pending tests remain in place. These checks make no external provider calls.

On 2026-10-06, the final implementation passed 60 focused tests in four files and the complete `npm run check`: typecheck, 1,095 tests plus one existing skip across 77 files, documentation links across 123 Markdown files, bounded policy checks, formatting and build. Vite retained its bundle-size warning; successful build is not a runtime performance measurement. Earlier failed test assertions and the shorter-reference regression were retained during diagnosis rather than counted as passing checks.

The previous live staging check on deployment SHA `e8918ab101c7a21a9167261ff4e8df39e87e125c` produced a validated author rewrite. Its first clipboard observation differed from the display; recopying the same candidate immediately matched exactly. That discrepancy remains recorded in the separate submission audit and is not treated as an unconditional first-copy pass. The new reference format still needs owner deployment and a live display/copy check.

Rollback is a revert of the reference-format commit. No migration or corpus restoration is needed.
