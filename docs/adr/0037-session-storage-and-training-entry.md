# 0037. Session storage and training entry

Status: accepted (2026-11-10). Extends [0036](0036-training-plans.md).

## Context

Plans store small target arrays on an exercise. Logging has different requirements: completing
one set must survive a restart without overwriting another set's offline edit. History must
remain readable after its source Workout or exercise catalog content changes.

## Decision

Session implementation will use separate synced rows for the Session, its exercises and logged
sets. Each gets a client UUIDv7 and an owner. Exercise and set ordering use fractional positions.
Logged sets hold actual values, kind, completion timestamp and their planned target snapshot.
Session exercises snapshot the exercise title, type and units needed to interpret the record.
Source plan and catalog ids are references, never the source of historical display content.
Deleting a plan does not cascade into history. Session deletion follows the existing tombstone
and explicit-restore protocol. Server upload handlers validate ownership through every parent.

A completed set is one local transaction and one queued row write, not a replacement JSON array.
The first Session slice must prove offline completion, kill-and-resume, replay, account isolation
and independent edits to different sets across devices. Same-set conflicts retain server-order
last-write-wins. Starting and finishing must be idempotent. Concurrent sessions on two devices
must be resolved explicitly rather than silently losing either record.

Rest uses an absolute `rest_started_at` and `rest_ends_at`, associated with the triggering set.
The displayed countdown is derived from the clock and recomputed on foreground or resume.
Timer expiry does not depend on JavaScript continuing to run in the background.

The session UI will have an inline actual-set grid with Previous values, a completion control
that starts rest, a persistent Resume bar, and a workout preview with Start as the primary action.
Finishing offers an explicit choice to update planned targets; it never rewrites the source plan
without that choice. History and personal records query completed logged-set rows.

Home currently opens saved plans. Next up requires the Active program, Run, Cycle and Slot
completion records from 0036. Recent workouts means completed Sessions, not recently created
plans. Those sections and Start/Resume ship with working session storage and logging.

## Consequences

More rows and upload validation than a JSON array, in exchange for independent set writes and
queries for previous values, records and volume. This ADR defines constraints; it does not add
Session tables, a timer, background notifications or live logging.
