# Reviewer staging acceptance checkpoint — 6 October 2026

Issue [#156](https://github.com/smaq777/Basira-Hackathon/issues/156);
implementation PRs [#159](https://github.com/smaq777/Basira-Hackathon/pull/159)
and [#160](https://github.com/smaq777/Basira-Hackathon/pull/160) are merged.
This is a bounded engineering checkpoint, **not full goal acceptance**.
Vercel, main and production are excluded. The detailed next-owner handoff is in
[Ahmed's assigned issue #157](https://github.com/smaq777/Basira-Hackathon/issues/157).

## Deployed state and checks

- Verified code merge: `f3eb3814910fe888cb59e00ee64a4c01a13efeb5` on
  `development`, Railway deployment `3f3a4027-e991-4060-8d5b-94a4f3399320`,
  status `SUCCESS`. Later documentation merges must receive their own deployment
  receipt; this identity is the tested code checkpoint, not an evergreen pin.
- `/health` returns `status=ok`; `/ready` returns `status=ready`,
  `database=ready`, migration `0018_email_delivery_receipts`,
  **`verification=false`**. Process/database readiness is not scientific readiness.
- Full Node 24 validation at PR #160: 859 tests in 62 files, typecheck,
  documentation links, policy, formatting and build passed. Required GitHub
  checks `quality`, `policy` and `dependency-audit` passed for both PRs.
- Report/corpus migrations 0016–0018 were rehearsed on isolated databases and
  applied to the explicitly bound staging targets. Existing passage identities
  and reader credentials were preserved. Source curation uses a separate scoped
  writer; no reader table-write grants were added.
- Owner-authorized staging mode admits any authenticated reviewer without the
  sole-curator allowlist. Anonymous live source publication returns HTTP 401;
  unknown/production deployments retain the restricted default.

## Fresh Arabic cases on the tested deployment

| Case                                                                        | Observed result                                                               | Boundary                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Unreferenced `وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لهم` | Canonical Quran 2:271 located; `لهم` versus `لَّكُمْ` localized               | Faithful source excerpt extent; no intent/fabrication judgment |
| Owner's full anti-extravagance paragraph                                    | Quran 7:31 matched with orthographic/full distinction; both hadith unresolved | No Quran evidence borrowed to resolve hadith                   |
| Wedding hadith paragraph                                                    | Unresolved where no contiguous verified hadith match exists                   | No unrelated Quran/Tafsir substituted                          |
| Unrelated file-management text                                              | No quotation/source evidence produced                                         | No thematic religious source invented                          |

The first bare-excerpt attempt failed to locate its verse. PR #160 added bounded
MCP locator discovery, followed by canonical re-fetch and unique whole-excerpt
alignment. Search snippets and model memory are not source evidence. Provider
failure, ambiguity and thematic neighbors still abstain.

Fresh browser reproduction verified a completed result (not an endless spinner),
the right-hand navigation and two side-by-side comparison cards. At the observed
desktop viewport, navigation x=1051; comparison article x positions=528.5 and 24,
each width=488.5. Clicking `آية` sets its selected state and adds the existing
`foundation-type-highlight--active` class to the Quran mark, whose computed
background is `rgba(226,177,58,0.3)`. The UI announces the matching type color;
colors identify the phrase type, not correctness. Comparison navigation scrolls
to the selected difference. Mobile and full multi-type live coverage remain
separate acceptance checks; desktop geometry is not a mobile claim.

## Implemented versus live acceptance

Isolated SQL/API tests cover independent human versions, stale-write rejection,
unchanged original/AI baseline, exact email-version binding, wrong-email lookup
denial, pagination/priority, recoverable archive/restore, source approval
idempotency/revocation and reader-write denial. These do not replace the remaining
shared-staging publication and subsequent retrieval test.

One controlled receipt reports receiving-mail-server delivery. Inbox placement
has not been confirmed. The controlled reviewed report is prepared but **not
published** pending action-time confirmation; its full-report email has not yet
been sent. Test delivery is restricted to the owner-authorized mailbox; no
existing ticket-owner test sends are authorized by this checkpoint. Addresses,
credentials and recipient contact values are not recorded here.

## Remaining acceptance gates

1. Confirm and publish the prepared controlled report; reload its exact human
   version, unchanged submission/AI baseline, linked evidence, advice and changes.
2. Verify correct ticket/email lookup exposes that full publication; incorrect
   email and archived ticket remain denied. Exercise recoverable archive/restore
   through the live workflow only with action-time confirmation.
3. Verify the exact reviewed-report email version, provider message ID and
   delivery event, then obtain mailbox confirmation (including junk/spam).
4. Explicitly approve a genuine attributed source with truthful rights; verify
   its actual stored corpus receipt and later relevant Arabic retrieval. Include
   an unrelated/no-match control; never add synthetic religious evidence.
5. Finish responsive reviewer/public-report and multi-type highlight checks.
6. Update issue/handoff with final deployment and actual acceptance receipts.
   Leave issue closure to the owner; do not claim comprehensive hadith coverage,
   scholarly endorsement, competition submission or general accuracy.

The evidence-bound AI suggested-edit section exists, but unsupported suggestions
are withheld. Ahmed is asked in #157 to refine the actual model integration and
held-out Arabic cases without weakening citation/span/meaning checks. Saleh has
done his best on the result-page redesign and asks Ahmed to refine it further.
