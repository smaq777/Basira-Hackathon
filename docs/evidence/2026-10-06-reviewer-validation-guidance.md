# Reviewer publication validation guidance

Related to #205; follow-up during the owner-authorized ticket-notification staging
rollout under #202. The user reported the generic Arabic source/HTTPS error when
updating a ticket.

The visible edit contained optional suggested text while all records remained
unresolved/unassessed with no evidence. The existing contract correctly rejects
that combination with `SUGGESTION_REQUIRES_EVIDENCE`; the UI incorrectly replaced
all validation reasons with one generic message. No reviewer edit was cleared,
source fabricated, determination approved or user ticket published during diagnosis.

The editor now displays actual validation reasons with the relevant field,
source number or record number. Unsupported suggestions explain leaving that
optional field blank for a notes-only report, or supplying a resolved finding
with linked evidence and reasoning. Invalid HTTPS links, incomplete source data,
missing links and unsupported resolved findings remain rejected by the same
schema gates. Cross-record validation adds issue paths, without changing allowed
or rejected content. Rejected publication preserves all entered values.

Targeted regressions reproduce the entered greeting, check the exact correction,
retain summary/suggestion/note, and verify successful notes-only publication after
the reviewer clears the optional unsupported suggestion. Additional tests retain
unsafe-link/source completeness and resolved-finding guards. Required check and
live browser outcomes are recorded on issue #205 and its pull request. Node 24
`npm run check` passed: 80 test files, 1,114 tests passed and one skipped; typecheck,
documentation, policy, formatting and production build passed. The targeted
validation/editor suite passed all 16 tests across three files.

No database migration or provider configuration change is part of #205. The
notification migration remains #202. Rollback uses a reviewed application revert;
the original submission, immutable report, source approval gates and notification
queue are preserved. Owner acceptance and final issue closure remain separate.
