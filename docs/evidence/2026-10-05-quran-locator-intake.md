# Bound Quran locators at intake — 5 October 2026

Related to [#108](https://github.com/smaq777/Basira-Hackathon/issues/108), #11 and
#18. The retained first-outcome mixed-writing report on frozen `b99e910` contains
a faithfully compared partial Ayah but also a false unresolved quotation of
`لقمان: ` from the trailing reference `[لقمان: 31:15]`.

## Cause and correction

The Python intake treated square brackets as quotation containers. Numeric
parsing recognized only `31:15` as a source mention; the overlapping-quotation
path turned the leftover name/colon into an unclassified quotation. The report
then selected this unresolved fragment ahead of the faithful Ayah comparison.
Claim inventory already excluded the recognized bibliography, so improving claim
selection alone could not correct this separate quotation boundary.

Source intake v1.9 recognizes only independently parsed, balanced square or
parenthesized containers whose entire inner text is a bounded Quran locator.
Numeric identity must resolve to exactly one pinned verse. An optional surah
label, including the `سورة` prefix, must match that pinned source name under
comparison normalization. The full original inner span becomes `claimed_source`
with the canonical source key; it does not become a literal quotation.

Whitespace, Arabic/Western digits, supported colon glyphs and label diacritics
are comparison inputs; no original text is normalized or rewritten. Only admitted
numeric references are removed from quotation comparison. Existing non-source
time/score guards also cover explicit ratio cues. Unknown/wrong names, missing
name metadata, unavailable verses, ranges, malformed wrappers and containers
with authored prose/qualifiers keep visible conservative fallback. A locator
inside genuine source speech does not suppress the speech. This change does not
assign support relations or approve a source.

## Offline evidence

- The actual retained public case was sent through the real Python adapter,
  unchanged Node intake validator and claim inventory, against the read-only
  pinned local source index with live acquisition disabled. It now produces one
  Ayah comparison. That finding is identical to the original report's first
  finding, with the same original source text/hash and source-name provenance.
- The full locator binds to that same source. Every emitted codepoint/UTF16 slice
  and the original revision hash was checked. The one original author candidate
  is identical, including conditions, negation and obligation wording. The
  historical report file hash is unchanged.
- Twenty focused Python boundary tests cover the actual public mixed text,
  Arabic digits/diacritics, astral prefixes, wrong/missing names, unavailable/range
  and malformed references, time/score/ratio contexts, author qualifications and
  true speech containing a reference. Synthetic records remain labelled owned
  engineering fixtures, not religious evidence.
- Focused Node validation/inventory and unchanged presentation tests pass. A new
  contract regression confirms the full locator is excluded from claim inventory
  and comparison selection while remaining in the original, and legacy intake
  v1.8 remains readable. No web implementation files or schema were changed.

External actual-case evidence:
`AI_Foundation/experiments/quran-locator-intake-2026-10-05/OFFLINE_ACTUAL_CASE_V1.json`.
This execution made zero model/web/Neon calls, durable report writes or environment
file writes. Source-index originals and historical report bytes were not changed.

## Limits and rollback

This is selected deterministic boundary evidence, not a paid replay or general
quotation/extraction accuracy evaluation. Full runtime/UI reproduction needs its
own frozen lead-reviewed scope. Existing malformed model language, escalation
wording, scope negation and evidence relevance remain separate follow-ups.
Reverting this parser change affects future intakes; retain stored reports and
their versioned originals. Owner acceptance and deployment remain separate.
