# Staging evidence and guest persistence repair

Issue [#193](https://github.com/smaq777/Basira-Hackathon/issues/193).

## Reproduced causes

- The previous curator targeted a different endpoint from the active reader.
  The active research database had 175 passages and schema through 0010, but no
  source-approval function. Retargeting the URL alone would not fix publication.
- Guest expiry was anchored to session creation. A late save inherited the old
  expiry. A rollback-only synthetic session with 30 seconds remaining reproduced
  this boundary. This does not prove the historical deletion cause of report
  `3c15330c-9d6d-42ea-ae5b-b390d0138480`.

## Bounded repair

Reuse migration 0017: immutable original passage, approved edition, snapshot
membership and reviewer audit. Use a separately named reviewed overlay, preserving
the 175-passage submission snapshot, embeddings, Quran and relevance gates. A new
scoped login targets the actual reader database; old configuration is kept privately
for rollback. Never use a reader or owner credential as the runtime writer.

Successful saves/submissions renew the existing live guest session transactionally
and refresh the same secure cookie, capped at 24 hours. Expired/deleted sessions
are not revived, and reads do not extend retention. This is not indefinite storage.

## Rehearsal and retained failures

The isolated expiring Neon child is `br-sweet-sky-b2wquml6`. The first rehearsal
failed because the owner cannot assume the new curator role. No extra membership
was granted: the separate curator connection already proved approval, and corrected
readback uses owner execution plus the existing reader role in a rollback-only
transaction. Second rehearsal passed approval idempotency, reader visibility, no
reader write capability and unchanged original counts/hashes. Synthetic evidence
was not committed to shared staging.

The Railway report rollback test passed owned renewal and rejected expired
authentication/revival. The historical failed report remains absent.

The prior release `e8918ab101c7a21a9167261ff4e8df39e87e125c` succeeded as deployment
`33a5c41b-a3d1-41c5-814d-04b3e19bba3c`, with HTTP 200 health/readiness/capabilities.
That is not proof of this repair's activation. Record the new accepted/deployed SHA
and live receipts on issue #193; do not claim full publication acceptance early.
