# Result navigation scroll correction

Related to [issue #180](https://github.com/smaq777/Basira-Hackathon/issues/180).

## Scope and cause

The owner accepted the current report design and results and requested only
viewport-sticky right navigation. On the existing owned staging report, scrolling
the desktop document moved the menu above the viewport despite `position: sticky`.
The `.app-page` ancestor's `overflow-x: hidden` computed to `overflow-y: auto`,
creating a non-scrolling ancestor that trapped the sticky menu.

The correction scopes `overflow-x: clip` to `.result-page`, retaining horizontal
clipping without that scroll container. Desktop navigation retains its existing
right-hand grid position and 18px top offset, with a viewport-bounded height and
internal vertical scrolling on short screens. The existing narrow-screen
horizontal navigation is retained, with its vertical height bound reset.

The public result screen passes its unchanged final actions, review notice and
rewrite panel into the report content layout. This extends the same sticky
container through the final sections instead of letting the menu scroll away
when the reader reaches them. These sections align with the report column;
their text, callbacks, visibility gates and order are unchanged. Embedded ticket
and reviewer reports that do not provide these children keep their existing content.

No report data, source retrieval, AI prompts, evidence validation, rewriting,
copy checks, original submissions, reviewer actions or database state is changed.

## Verification and delivery

CSS contract regressions guard the overflow, height and responsive declarations.
The existing report tests cover section expansion, selected navigation and target
highlighting. DOM-only tests do not prove sticky layout; actual browser scroll,
short-desktop and narrow-screen checks are required before release acceptance.
Actual command results, browser observations, PR/CI and staging deployment receipts
are recorded on issue #180. Implementation alone is not deployment.

## Rollback

Revert the scoped CSS change through a merge-commit PR to `development` and deploy
the accepted rollback SHA with the existing staging SHA guard intact. Production,
Vercel, provider settings and corpus activation remain outside this change.
