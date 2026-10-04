# Tanzil Uthmani v1.1 source intake

**Status:** rights-compatible technical intake verified; passage selection and content coverage are pending qualified human review.

This record allows the engineering pipeline to reproduce a source download without claiming that Basirah's religious coverage has been approved. It does not relicense the source and it does not permit modified Quran text.

## Edition registry

| Field                  | Recorded value                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Source key             | `tanzil.quran.uthmani`                                                                                                     |
| Work                   | القرآن الكريم                                                                                                              |
| Provider               | Tanzil Project                                                                                                             |
| Script/edition         | Uthmani, download option `uthmani`                                                                                         |
| Content version        | Tanzil Quran Text v1.1, published February 2021                                                                            |
| Official download      | `https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&tatweel=true` |
| Official license       | [Tanzil Text License](https://tanzil.net/docs/Text_License)                                                                |
| License                | Creative Commons Attribution 3.0, subject to Tanzil's stated terms                                                         |
| Required attribution   | Identify Tanzil Project as the source and link to `https://tanzil.net/`                                                    |
| Modification rule      | Store and display the downloaded original verbatim; search normalization must be a separate derived field                  |
| Verified download rows | 6,266                                                                                                                      |
| Download SHA-256       | `6933e133dd56db778c801bf738848454e43648105a151e8d84d86a7cae39ec5f`                                                         |
| Intake date            | 3 October 2026                                                                                                             |
| Content reviewer       | Pending                                                                                                                    |

The official terms permit verbatim copying and distribution with attribution and a Tanzil link, and prohibit changing the Quran text. Basirah must include the Tanzil copyright/license notice in any substantial derived corpus export. The normalized search key is never displayed as source text.

## Candidate 30-reference engineering manifest

This list is an engineering candidate only. It is deliberately **not** marked approved and must not enter a production evidence bundle until a qualified reviewer confirms the selection, context boundaries, and intended coverage.

```text
2:261  2:262  2:263  2:264  2:265  2:266  2:267  2:268  2:269  2:270
2:271  2:272  2:273  2:274  2:275  2:276  2:277  2:278  2:279  2:280
2:281  2:282  2:283  2:284  2:285  2:286  16:43  17:36  39:18  49:6
```

The contiguous `2:261`–`2:286` block is proposed to prevent the demo verse at `2:271` from being isolated from nearby qualifications. The four additional references are candidate evaluation anchors, not a claim of comprehensive Islamic coverage.

## Required reviewer checklist

Before changing `approval_status` from `pending` to `approved`, the reviewer must:

1. Compare every selected row with the official Uthmani v1.1 download.
2. Confirm that the passage and neighboring-context boundaries do not remove negation, conditions, exceptions, or attributed disagreement.
3. Approve the intended test coverage and explicitly record exclusions.
4. Confirm the attribution and link presentation.
5. Sign the corpus version and content hashes without placing private reviewer details in the public repository.

If any passage is withdrawn, mark the edition/passage revoked, invalidate dependent evidence bundles and evaluation results, and rerun the affected cases. Do not silently replace it with another work.

## Reproduction checks

The downloaded file is UTF-8 with one `sura|aya|text` record per row. Intake must reject malformed coordinates, duplicate references, empty source text, a row count other than 6,266, or a download hash different from the value above. A changed official release requires a new content version and a fresh review; it must never overwrite v1.1 in place.
