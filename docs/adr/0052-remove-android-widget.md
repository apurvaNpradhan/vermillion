# 0052. Remove the Android home-screen widget

Status: accepted, 2026-11-21. Supersedes the widget described in the native dev guide (native
stack revisions 19 and 20); no earlier ADR recorded it.

## Context

The "Next workout + week" widget (a local `next-workout-widget` Expo module drawn with
`RemoteViews`, a snapshot builder, a host component and a `widget-start` deep link) did not work
on devices, and fixing it was not worth a second native surface to maintain before the beta.

## Decision

- Delete the module, the `widget-start` route, `training/widget/`, its exports, its `widget__*`
  keys and its docs. The module registered itself through the manifest merger, so there was no
  config plugin entry to remove.
- Bump the native stack revision to 24 so no over-the-air update targets builds that still have
  the module.

## Consequences

- Rebuild the dev client; installed builds that had the widget lose it on update.
- A widget can come back later as its own decision, built on the then-current Expo tooling.
