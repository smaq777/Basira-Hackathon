# Documentation hub

Basirah documentation is **English-first**. The product interface is Arabic-first. Arabic is used here to preserve Islamic terminology, exact quotations and realistic interface examples, not as a competing technical specification.

Read [current status](STATUS.md) before interpreting any diagram as implemented behavior.

The [AI foundation integration](architecture/FOUNDATION_INTEGRATION.md) records the
current-UI bridge, indicator decisions, source dependencies and prioritized agent work.
The [source services decision](architecture/SOURCE_SERVICES.md) records the live
Tafsir inventory, MCP/storage roles and the report-language follow-up.

The [direct Gemini backup](operations/GEMINI_BACKUP.md) records the default-off
text-provider recovery path and Saleh-owned staging activation.

## Reading paths

- **Developer:** [setup](operations/SETUP.md) → [credentials](operations/CREDENTIALS.md) → [requirements](product/REQUIREMENTS.md) → [complete system blueprint](architecture/SYSTEM_BLUEPRINT.md) → [architecture summary](architecture/ARCHITECTURE.md) → [tests](testing/STRATEGY.md).
- **Content reviewer:** [glossary](product/GLOSSARY.md) → [source policy](governance/RIGHTS.md) → [Tanzil intake](content/TANZIL_INTAKE.md) → [RAG](architecture/RAG.md) → [evaluation](testing/STRATEGY.md).
- **Committee:** [judge quickstart](hackathon/JUDGE_QUICKSTART.md) → [alignment](hackathon/ALIGNMENT.md) → [business model and Arabic review cases](hackathon/BUSINESS_MODEL_AND_TEST_CASES.md) → [committee guide](hackathon/COMMITTEE_GUIDE.md) → [foundation record](evidence/2026-09-30.md) → [governance record](evidence/2026-10-01-governance.md) → [security and mobile verification](evidence/2026-10-03-security-mobile.md).
- **Team member:** [contributing](../CONTRIBUTING.md) → [workflow](governance/WORKFLOW.md) → [backlog](planning/BACKLOG.md).

The [Render hosting alternative](planning/RENDER_HOSTING_PLAN.md) is a planning
proposal only; it does not change the current deployment or Neon bindings.

## Documentation contract

Every material change updates the relevant document in the same pull request. Use explicit labels: **Implemented**, **Verified**, **Planned**, **Blocked**, **Accepted**, and **Released**. These states are not interchangeable.

Write English headings, explanations, issue titles, acceptance criteria, API field names and code comments. Define an Islamic term in English on first use, retain its Arabic spelling, and distinguish attributed scholarly statements from system-generated analysis. Never translate a quotation and label the translation an exact Arabic match.

Do not insert personal conversation transcripts, credentials, local absolute paths, unpublished user submissions or unlicensed source archives. Link evidence rather than claiming that a diagram, mockup or passing unit test proves a functioning scholarly product.

Owner: Saleh Alqahtani (`smaq777`). Repository collaborator: `AhmedAlbishri`. Qualified content reviewer remains to be confirmed. Last baseline: 3 October 2026. Live GitHub Issues and pull requests supersede the static baseline.
