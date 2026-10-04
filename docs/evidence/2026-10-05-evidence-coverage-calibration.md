# Claim evidence coverage and assessment calibration

Related to #8, #13, #16 and #18; continuing the owner-requested review in draft
PR #59. This is an engineering diagnosis and development experiment, not an
independently adjudicated religious benchmark.

## Source review

The owner supplied three public pages after reviewing the four selected claims in
the prior local report. They were inspected on 5 October 2026:

- [Shamela, printed page 201](https://shamela.ws/book/30015/195), from Muhammad ibn
  Khalifah al-Tamimi's book on tawhid and the pillars of faith, contains attributed
  statements and bibliographic footnotes addressing the foundation claim. The web
  route's number is not the printed page number.
- [Ibn Baz's discussion](https://binbaz.org.sa/fatwas/20123/التوحيد-اصل-الدين-واساس-الملة)
  explicitly addresses the foundation of religion, priority in prophetic calling
  and the greatest duty. This source was absent from the original model packet.
- [The Ibn Baz lesson transcript](https://binbaz.org.sa/audios/2092/01-باب-حق-الله-على-العباد-وحق-العباد-على-الله)
  contains the Muadh narration identified by the owner. It directly addresses
  God's right over His servants. A compound claim's additional comparative terms
  still require their own support or attribution; one supported component should
  not be presented as a conflict with the whole sentence.

Full source text and experiment packets remain outside Git. Public accessibility
and owner-supplied links do not by themselves complete edition/rights review or
constitute a blanket approval of every page on a domain.

## Controlled development experiment

The protocol was frozen before six sequential OpenRouter calls: four factorial
cells and two matched negative-control cells, with no retries. All used
`openai/gpt-6.1-sol`, provider `OpenAI`, low reasoning and a 60-second external
request timeout. The four original UTF-16 claim spans, source order and source
families were fixed. Enrichment appended the three attributed source passages to
claims 1, 2 and 4; claim 3's evidence stayed unchanged. Author context remained
separate from evidence in every cell.

| Instructions / evidence | Claim 1                   | Claim 2                   | Claim 3                   | Claim 4                   | Duration |
| ----------------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- | -------- |
| v1.3 / original         | Insufficient context      | Insufficient context      | Supported                 | Insufficient context      | 23.81 s  |
| Revised / original      | Supported                 | Not established           | Supported                 | Not established           | 25.12 s  |
| v1.3 / enriched         | Supported                 | Supported                 | Supported                 | Supported                 | 24.66 s  |
| Revised / enriched      | Invalid citation response | Invalid citation response | Invalid citation response | Invalid citation response | 26.11 s  |

The last cell proposed support for all four claims, but one cited excerpt added
words absent from its selected original. Exact-citation validation rejected the
response; its proposed verdicts are not counted as validated results. This failure
is retained without a corrective retry. Exact excerpt checks must not be relaxed
to make a useful-looking response pass.

The experiment scores citation validity for the whole response. The existing
runtime instead retains independently valid findings and marks the report partial
when another finding has invalid citations; that recovery behavior is unchanged.

Both matched negative-control calls rejected the two false assertions, preserving
negation, permission conditions, an exception and unsupported ranking. They took
7.01 and 7.97 seconds. All six HTTP responses succeeded; five passed output and
exact-citation checks. Total provider-reported cost was USD 0.220489.

The useful finding is the separation of causes: supplied evidence resolved the
four claims even with the original instructions, while revised instructions made
remaining gaps more specific on the original packet. The first claim's changed
same-evidence verdict shows prompt sensitivity, not proven accuracy. One sample
per cell, two authored controls and no independent scholarly labels cannot
establish calibration, robust latency or broader model quality.

Enrichment used manually selected original passages with explicit experimental
`scholar_explanation` and `book_excerpt` roles and pending research status. The
external validator checked identities, hashes and exact citations. These are not
supported runtime source roles yet, and the experiment is not automated web RAG
or production ingestion. The artifacts are in the external research workspace:
`AI_Foundation/experiments/claim-evidence-calibration-2026-10-05`.

## Local prompt follow-up

The optional local producer now records `evidence-support-v1.4` and
`provisional-semantic-v1.4`. It applies the general metadata, semantic-entailment
and compound-clause clarification. Relative to the experimental wording, runtime
instructions retain their existing author-context framing, generalize the ordering
example, exclude unsupported experimental source-role guidance, explicitly retain
the empty-evidence `insufficient_context` rule and prohibit joining or changing
words inside cited excerpts. This is a local research refinement, not promotion
of an independently calibrated model.

Original source roles, exact-citation validation, provisional/approval status,
model routing and deadlines are unchanged. Historical v1.1–v1.3 reports remain
readable; their assessments are not retroactively changed. Deployment flags remain
off. Runtime source coverage is still the original quotation-led manifest, so this
prompt change alone cannot reproduce the manually enriched experiment.

## Editorial presentation

Repeated source-link hints now group by stored topic and action while retaining
distinct affected sentences. The owner case displays one note with two expandable
locations instead of repeating the same keyword and instruction. Different
topics/actions remain separate. The note asks the writer to clarify the source
connection without claiming that a theme lookup established absent evidence.

The assessment navigation button scrolls and focuses its heading without changing
the hash-router report URL. A real browser check on the existing report confirmed
both locations, the unchanged URL and heading focus. Original draft and saved
report data were not changed. A screenshot remains outside Git at
`experiments/ui-refinements-2026-10-05/editorial-notes-refined.jpg`.

## Integration validation

- `npm run check` passed on Node 24: 410 tests in 24 files, TypeScript,
  documentation links, policy, formatting and build. The existing non-failing
  approximately 660 kB main-chunk warning remains.
- Independent review found no confirmed regression in the grouped notes or
  semantic delta. Targeted semantic tests passed 76 cases, including historical
  report compatibility, unchanged evidence/metadata transport and rejection of
  an added citation prefix. Mocked controls verify transport/validation behavior,
  not model accuracy.
- A separate actual-UI reanalysis completed in 57.097 seconds. Extraction took
  9.089 seconds and assessment 24.600 seconds; total provider cost was
  USD 0.04539455. Both provider stages succeeded. All five selected claims had
  valid findings and eight exact citations: two supported and three
  `not_established`. No blanket incomplete-Tafsir explanation remained.
- That reanalysis selected five claims rather than the earlier four. It is an
  integration check, not another fixed-claim experiment cell. It retained the
  original text/hash, all 12 quotation findings and 31 source rows. The overall
  source report remains partial while its semantic stage completed. Its ID is
  `6087aad7-04da-4cf8-8cc5-b25bae58ace5`; the prior report was preserved.

The fresh UI result still lacks the manually added web sources. It demonstrates
the need for the next retrieval integration rather than claiming the evidence
coverage problem is solved by the prompt. Full report/summary artifacts remain
outside Git in the calibration experiment directory.

## General failure mechanisms

1. **Evidence coverage:** the extractor proposes keys from the quotation-led intake
   manifest; the adapter expands their source families for the assessor. Neither
   can cite useful sources that retrieval never supplied. A stronger model does
   not repair this missing retrieval step.
2. **Compound assertions:** a sentence can combine a supported proposition with
   an additional scope, ordering or comparative term. Explain which portion is
   supported and which needs evidence; absence of support is not contradiction.
3. **Coverage metadata:** `contextCoverage.status=partial` can mean that one of two
   requested Tafsir works was unavailable. It is not proof that the passage that
   was returned is truncated. At 21:25 both works were present, yet the prior model
   still used an incomplete-Tafsir explanation for claims also linked to another
   verse with partial work availability.
4. **Overly literal support checks:** quotation fidelity requires exact source
   comparison. Claim assessment instead checks meaning, preserving conditions,
   negation, exceptions and scope. It must not demand identical author/source
   wording or manufacture a chronology conflict from an unresolved qualifier.
5. **Editorial noise:** theme heuristics generated two identical actions anchored
   only to the same keyword. Their narrow topic catalogue cannot establish that
   an author has supplied no relevant evidence elsewhere in the draft.

## Next implementation order

1. **#13/#18: calibrate assessment and measure coverage.** Freeze the same claims,
   evidence identities, model and parameters. Compare old/new instructions on
   original/enriched evidence as separate factors. Include unrelated passages,
   false scope expansions, conditions and negation. Keep failed calls and source
   omissions visible. Then build a held-out set across several topics, with human
   adjudication independent of the implementation cases.
2. **#8/#11/#14: claim-driven retrieval.** Separate exact claim extraction from
   assessment; retrieve for each bounded assertion and its qualifications, while
   retaining the existing quotation-comparison path. Bind the final evidence
   packet before assessment and durable report completion. Do not append mutable
   evidence after hashes or source identities have been validated.
3. **#5/#6/#7/#8: persistent hosted corpus.** Ingest versioned original passages,
   paragraph/section context, footnotes, editions, canonical locators and review
   status into Neon. Use exact-reference and lexical retrieval alongside compatible
   embeddings/pgvector. Compare rankings on the same labelled queries; similarity
   is not a support probability. The earlier temporary pilot is not a hosted
   production corpus or runtime integration. The current runtime source contract
   also needs explicit book/scholarly-explanation roles: do not relabel a fatwa as
   Tafsir to fit existing Quran-parent rules. Cross-work commentary links need
   typed provenance distinct from same-edition passage parentage. PostgreSQL report
   persistence already exists; the missing hosted piece is the source corpus and
   its retrieval integration. The current local UI uses local PostgreSQL.
4. **#8/#9/#17: bounded web discovery fallback.** Trigger it for a specific evidence
   gap or stale corpus entry, not every draft. Search configured source domains;
   retrieve and inspect the original page rather than treating snippets as
   evidence. Validate destination, redirects, MIME/size limits and source identity;
   retain attributed, hashed snapshots with retrieval time and review status.
   Search failure must preserve the existing evidence and an explicit gap. MCPs
   are acquisition interfaces, while Neon stores reproducible evidence.
5. **#38: guarded rewriting.** Continue only after claim coverage, citation
   integrity and support calibration gates. Preserve source quotations and recheck
   a new immutable revision rather than silently altering the original.

The supported scope remains short Arabic Islamic-content drafts. Topic diversity
requires a broader source collection and evaluation; no corpus, search provider
or model guarantees coverage of arbitrary topics or scholarly agreement.
