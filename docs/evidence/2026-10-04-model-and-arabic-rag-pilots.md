# Bounded model and Arabic retrieval pilots

Related to #7, #8, #11, #13, #17 and #18. These are engineering pilots, not religious accuracy or scholarly acceptance results. Private corpora, drafts, frozen model outputs and credentials remain outside Git.

## Model comparison and integration

Twelve OpenRouter requests used only authored administrative synthetic text and fixed synthetic evidence. Expected labels, prompts, schemas and model/provider settings were frozen before each phase. Strict output, exact authored spans, source-family citations, finish status and Arabic explanations were checked locally. Source/draft instructions were treated as untrusted data. Final answers and safe metadata were retained; private reasoning was not.

| Configuration                           | Ten entailment controls in one batch | Assessment wall time | Extraction wall time |
| --------------------------------------- | ------------------------------------ | -------------------: | -------------------: |
| GPT-6 Luna, low, OpenAI                 | 10/10                                |              7.329 s |              3.423 s |
| Gemini 3.8 Flash, low, Google AI Studio | HTTP 400, unavailable                |              2.221 s |              3.365 s |
| DeepSeek v4.1 Flash, low, InferenceNet  | 10/10                                |             34.326 s |             18.845 s |
| GPT-6.1 Sol, high, OpenAI               | 10/10                                |             21.038 s |              9.331 s |

All four extracted four exact authored spans and excluded the quotation/question control. DeepSeek misclassified one obligation as descriptive. Gemini's assessment request failed while extraction succeeded; a schema-specific limitation is possible but not established. It is not an eligible assessment fallback.

Equal outcomes on ten simple controls provide no evidence that stronger thinking improves accuracy. They are one batch per configuration, not independent runs or scholarly labels. Model, provider and reasoning settings vary together.

The actual repository adapter was tested separately with Luna/low extraction followed by Sol/low assessment. Its first run correctly abstained on all four claims: extraction saw only source titles and IDs, selected no evidence, and assessment therefore received no sources. The repair adds bounded original previews with exact boundaries, hashes and a truncation flag. The same frozen fixture then produced four correct intended labels, identical exact claim spans, correct evidence associations and exact citations. Extraction took 2.673 seconds; assessment 8.812 seconds; total 11.497 seconds. This validates the integration shape on these controls only.

Reported model cost was $0.038363875 across successful calls. Cost for the failed Gemini request was not reported and remains unknown. No private real-writing draft was transmitted: automatic approval review required explicit permission for that payload and destination, which remained pending during this work.

## Runtime decision

The additive semantic adapter is default off and limited to loopback research preview. The tested route is Luna/low extraction and Sol/low assessment, pinned to OpenAI through OpenRouter. A small model identifies at most five exact authored claim spans and proposes evidence associations; the assessor receives full selected source families and separately describes conditions, negation, exceptions and scope. Associations and findings remain provisional.

The phase is bounded to 25 seconds with 12 seconds per request, reserving five seconds in the worker for persistence. At most one distinct configured fallback is supported in the adapter, but no fallback is configured in the runtime: no alternative passed this deployed-route gate. Authentication/credit failures block further gateway calls within the phase. Malformed/truncated output and invented citations withhold affected results. Missing claims do not imply that the draft has no assertions. Provider failure preserves source findings and yields an explicit unavailable semantic state.

The UI renders provisional findings and source excerpts separately from quotation fidelity. Model traces remain outside user-facing presentation. Existing stored reports remain readable; new semantic output is bound into the immutable report hash. AI-ReWrite stays disabled.

## Hosted Arabic retrieval

An isolated Neon branch tested 40 pinned canonical Quran research passages and 15 independently authored queries. Thirteen queries had expected references, and two were out of scope. Source approval remained pending. OpenRouter's OpenAI text-embedding-3-small produced real 1,536-dimensional vectors: 7,567 tokens, 2.474 seconds and $0.00015134 reported cost. No private writing was sent.

| Method                  | Macro recall@5 on 13 positive queries | MRR@5 | Median client/SQL round trip |
| ----------------------- | ------------------------------------: | ----: | ---------------------------: |
| Exact reference/excerpt |                                  .385 |  .385 |                      93.0 ms |
| Lexical                 |                                  .423 |  .304 |                     100.5 ms |
| Dense                   |                                  .756 |  .595 |                     123.4 ms |
| Hybrid                  |                                  .808 |  .628 |                     208.5 ms |

Exact lookup succeeded on both explicit references and all three faithful excerpts. Dense and hybrid hit a relevant source on all five paraphrases, but dense ranked their expected targets better. Hybrid missed one contradiction-relevance control that dense retrieved. Both returned candidates for both out-of-scope queries; no similarity threshold was fitted after seeing results. These rankings show candidate retrieval, not claim support. Tiny corpus size, authored labels and one run limit generalization; hybrid time sums sequential lexical/dense requests.

All originals, hashes and versions matched. Immutable-text, dimension and model/task/corpus guards passed. The runtime role saw zero pending sources/passages/embeddings. All transactions rolled back to zero rows. The disposable branch was deleted and its absence verified; production was unchanged.

Keep exact lookup first, then evaluate lexical/dense candidates and optional fusion. Broader held-out Arabic retrieval, source rights/content approval and persistent hosted corpus/runtime integration remain required. The current UI's source store is still the local pinned index with attributable Tafsir acquisition.
