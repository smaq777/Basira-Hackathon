# Claim-specific retrieval and quotation grounding — issue #151

## Scope and observed failure

The supplied wedding passage quotes “أعلنوا هذا النكاح” and “أولم ولو بشاة”. Before this patch, staging returned Quran 2:185 about Ramadan and narrations about Yemen as nearby evidence. Retrieval candidates were selected by lexical/vector ranking without a separate material-proposition relevance check. These passages did not establish the specific wedding propositions. This is not a finding that the author's text is false.

The hosted intake also recognized explicit Quran references but did not perform hadith quotation searches. Consequently the existing original-text color renderer had no hadith segments to display. The result legend was static text, not an interactive selector.

## Actual runtime pipeline

1. Preserve the exact submitted text and UTF-16 offsets.
2. Reuse the existing structural quotation/attribution detector with software fixture matching disabled. Search up to five visible hadith quotation spans by their own wording. Accept only a unique source identity with an exact contiguous or normalized contiguous quotation match in a `hadith_matn` original. Normalization handles orthography/diacritics, not paraphrase. Missing/ambiguous matches remain unresolved; unrelated neighbors are not attached to the quotation.
3. Select at most five substantive author assertions using server-owned C/E aliases and immutable spans.
4. Retrieve corpus candidates per assertion (exact references, lexical search, vector neighbors and configured page-cache views).
5. New relevance selection: accept only passages addressing the assertion's material proposition, action, entity, attribution or qualifier. Retain relevant contradictions and qualifications. Reject broad topic-only matches. The server resolves short aliases, rejects unknown/duplicate/incomplete selections, and removes unused retrieval-only sources. Original quotation intake is preserved. Selected commentary keeps its parent but does not automatically restore rejected siblings.
6. Assess the relevant packet and original author context. Empty packets require `insufficient_context` or `not_applicable`, not an unsupported verdict that the text is false. Explanations must address the exact assertion clause by clause and identify the missing specific narration/attribution where relevant.
7. The existing bounded web-gap acquisition runs for one unresolved claim. Its additions pass the same relevance gate before persistence or reassessment.
8. Verify citation keys, exact contiguous excerpts, source hashes and offsets server-side. Freeze/persist the final evidence packet and render existing comparison controls.

## Prompts and routing

MCP adapters acquire source text; they are not the assessment prompt. Configured Quran/Tafsir retrieval uses explicit references. There is no hosted hadith-specific live MCP in this path; hadith quotation matching uses the configured corpus. Web discovery uses the existing allowlisted acquisition route.

OpenRouter's chat-completions endpoint routes claim extraction and relevance selection through the configured extractor (`openai/gpt-6-luna` in the current server configuration), and assessment through `FOUNDATION_ASSESSOR_MODEL` or `openai/gpt-6.1-sol`. Provider routing is allowlisted with provider fallbacks disabled. The system prompt treats drafts/sources as untrusted data, forbids model memory as evidence, invented citations, fatwas, hadith grading and inferred approval, and requires strict JSON. There is no automatic religious authenticity verdict.

Prompt version: `evidence-support-v1.11`; semantic pipeline: `provisional-semantic-v1.11`. Exact selection instructions are maintained in `apps/api/src/semantic-relevance.ts`; extraction/assessment instructions in `apps/api/src/semantic-assessment.ts`. Older v1.10 saved reports remain readable. Relevance requests use the existing global deadline with a maximum 20-second request budget; failure does not open access to unfiltered evidence. Request traces store stage, route and hashes, not credentials or raw prompt text.

## UI interaction

The legend now activates the existing role color classes and emphasizes the matching segments, with keyboard focus and an explicit absent-type message. Author prose stays uncolored. This does not invent classifications or alter the submitted text, comparison status, analysis or report actions.

## Verification and acceptance

Targeted tests cover alias binding, wrong-topic removal, contradictory evidence retention, family context, failed relevance selection, web addition rejection, literal hadith matching/missing matches, and existing color activation. Full checks and live staging results will be recorded on issue #151 before acceptance.

Risk: semantic relevance selection can still make mistakes and corpus coverage can be incomplete. Exact quotation matching is not authenticity grading. Rollback is a reversible task-branch commit or redeployment of the previous accepted build; no saved sessions or database rows are deleted. No production migration is included.
