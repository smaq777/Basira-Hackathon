# Charity author-rewrite rejection investigation

Related to [issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157)
and provider-capacity [issue #169](https://github.com/smaq777/Basira-Hackathon/issues/169).
Scope: diagnose supported author rewriting and accurately describe retained
changes; no provider, corpus, database, deployment or approval changes.

## What can be reconstructed

The owner's earlier charity UI runs withheld suggestions, but the rejected
generator operations and independent verifier responses were not retained in
the accessible checkout. The two historical acceptance folders referenced in
the owner's evidence are unavailable here. Their exact failure stage and cause
remain unknown. Neither the length-budget fix nor this follow-up explains those
historical rejections without the missing packets.

An independent retained report from semantic 1.13 has the author assertion
`إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق`, a faithful Quran 2:271 quotation
and three exact Quran/Tafsir sources. Its eligible author packet cites the two
Tafsir sources and also includes their canonical Quran parent. Its subsequent
actual generator call returned HTTP 403, producing no candidate or verifier
response. That provider failure is distinct from a preservation rejection.

## Controlled offline boundary checks

The retained synthetic live report was passed through the real generator and
verifier response parsers, service reloads, deterministic candidate validation,
verifier-output validation and fresh copy reconstruction. Provider envelopes
were controlled fixtures; no network or paid model calls occurred. The fixture
verifier's positive booleans are not evidence of a live model's semantic judgment
or scholarly accuracy.

| Control                                                         | Observed boundary                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Formal wording with all controlled preservation checks positive | Validated author candidate, two mocked provider responses, exact server copy and unchanged original prefix |
| Negative condition-preservation check                           | Failed with `conditions_changed`; no text or copy                                                          |
| Negative scope-preservation check                               | Failed with `scope_changed`; no text or copy                                                               |
| Punctuation-only replacement                                    | Failed with `unchanged_wording` before the verifier                                                        |
| Safe author skip plus existing exact citation                   | Validated attribution without a verifier request; initially mislabelled as author wording                  |

The first offline outcome is retained outside Git as
`charity-rewrite-offline-first-outcome.json`. Four controls passed; the final
mode assertion failed. This proves the separate mode defect, not the historical
charity rejection. Controlled source replies and the actual earlier HTTP 403
remain separate evidence.

## Reproduced defect and fix

The candidate mode was initialized from the configured verifier capability and
only downgraded for the special quotation-only shortcut. A supported-author
generator is explicitly allowed to return no safe replacements while adding a
recorded citation. That path exposed a validated `supported_author_wording`
candidate with zero replacements and no verifier call.

The final mode now follows the retained operations: nonempty author replacements
are labelled `supported_author_wording`; citation/layout-only results are labelled
`citation_and_layout_only`. Complete-evidence eligibility, useful-addition gates,
quotation/source validation, independent verification of actual replacements,
ownership, immutable binding and fresh copy checks remain enforced. This does
not turn a withheld rewrite into accepted author prose.

The hosted service regression was run before the fix and failed on the exact mode
mismatch. After the fix, the targeted rewrite/service/diagnostic/Arabic UI suite
passed 56 tests in four files. The UI regression confirms that an attribution-only
result states that no alternative wording passed, displays no before/after author
edit and makes no claim that author wording improved.

The full Node 24 check passed 915 tests in 65 files, TypeScript, documentation
links across 108 Markdown files, bounded policy, formatting and production build.
The existing bundle-size warning remains. A second replay of the same five
controls after the correction passed all five assertions, including exact server
copy in both positive cases. Its separate receipt is
`charity-rewrite-offline-fixed-outcome.json`; the first failure was preserved.
SHA-256 receipt hashes are
`28a790ef03aa2e0f3f01c05967f70d6b4d94184c47d1554510bc72ebf54ef12e`
(first) and
`215bc8ae013bfb41fe41d730cdb62d05b59bdb9489f06c522a5e2669fc2eda19`
(fixed). These are software pipeline controls, not live model acceptance.

## Remaining live acceptance

After Saleh accepts and deploys the rewrite fixes and restores bounded provider
capacity, retain the first fresh supported-author attempt. If it fails, the
default-off `FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS=true` flag identifies the
fixed stage/reason and packet hashes without logging source/draft/model text or
credentials. For example, `generation / provider_unavailable`,
`candidate_validation / unchanged_wording`, or
`verification_validation / conditions_changed` call for different fixes. A
hash-only receipt identifies the boundary; it cannot reconstruct a missing
replacement or prove why the model judged it unsafe.

Formal wording and accurate citation remain the submission target. The positive
live case must contain an actual author replacement, completed independent
verification and exact UI/server copy. Safe skips must retain their attribution
label. Expansion, stronger claims, unrestricted essays and multiple rewrite
styles are not implemented by this change. Acceptance and issue closure remain
with Saleh.

Rollback: revert this mode correction through the existing issue/PR workflow.
Turning off staging rewrite availability withholds the whole feature; the optional
diagnostic flag can remain off. No source-original or persisted report mutation is
introduced.
