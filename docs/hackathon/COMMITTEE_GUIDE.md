# Committee handoff guide

**Current status: preparation, not a final submission package.** This guide tells a reviewer what is verifiable now and what must be supplied before handoff.

## One-sentence project

Basirah helps Arabic Islamic-content editors distinguish an accurate quotation from an unsupported inference, with source-linked findings and explicit abstention.

## Current reproducible evidence

- Start with the [judge quickstart](JUDGE_QUICKSTART.md); it requires no API key for the current foundation.
- Follow the [local setup](../operations/SETUP.md) to build and run foundation checks.
- Use the [credential guide](../operations/CREDENTIALS.md) only for integrations marked implemented in the delivered release.
- Inspect [contracts](../../packages/contracts/src/index.ts) and [tests](../../tests/contracts.test.ts).
- Read the [provider assessment](../api/PROVIDERS.md) and [Dorar limitations](../api/DORAR_AUDIT.md).
- Compare the [requirements](../product/REQUIREMENTS.md) with [current status](../STATUS.md).

There is no verified live product URL or measured domain accuracy result in the foundation. The web shell explicitly discloses this.

## Planned two-minute demonstration

1. Show a short approved example with a correct quotation but an overbroad inference.
2. Confirm the extracted claim and show the original source passage.
3. Display separate quotation and support findings, highlighting the missing qualification.
4. Revise the conclusion and rerun against a new revision.
5. Show an unavailable-source example that abstains rather than inventing a verdict.
6. Finish with measured evaluation evidence and limitations, not a universal accuracy claim.

The actual example must be approved by a content reviewer. Do not present a synthetic software fixture as religious evidence.

## Final release checklist

- [ ] Working demo URL and access instructions tested in a clean session.
- [ ] Public repository after owner-approved secret/history/license review.
- [ ] Tagged release and exact baseline-versus-hackathon change record.
- [ ] Installation, configuration, migration and rollback instructions match reality.
- [ ] Credential guide names official creation pages and safe variable locations without including values.
- [ ] Approved corpus manifest and attribution/licensing disclosure.
- [ ] Reproducible evaluation report with raw sanitized results, sample counts and baselines.
- [ ] Known limitations, failures and human-review boundaries.
- [ ] PDF/PPT presentation and video no longer than two minutes.
- [ ] Team member names/roles confirmed by the owner.
- [ ] Organizer submission receipt captured and privately retained.

Prepared, reviewed, merged, deployed, submitted and accepted are separate states. Record each explicitly.
