# 0049. Preferences sync through PowerSync

Status: accepted, 2026-11-18. Extends [0019](0019-synced-table-conventions.md) and
[0021](0021-device-owner-and-account-lifecycle.md).

## Context

Preferences (weight unit, language, time zone, the `ui` settings) were read through an oRPC query
and written through an oRPC mutation, with a device copy in storage. Offline, the signed-in
session lookup failed, so the user id was empty and the query never ran: Home, Body, Plates and
the Session timer waited on preferences forever, and a lb user saw kg. The device copy was deleted
on every cold start because it was read before the user id was known. A change made offline was
rolled back.

Almost everything the app does is local-first. Preferences were the one thing every screen needs
that still waited for the server.

## Decision

- `user_preferences` joins the `powersync` publication and a new stream, `my_preferences`
  (priority 1). It already holds one row per user, so there is no column change and no tombstone:
  the row is never deleted, and account deletion removes it by cascade.
- Reads come from the device's SQLite through one shared watch (`usePreferences`, same public
  API). It answers in milliseconds with or without a connection; a missing row reads as the
  defaults. The newest row id wins, so a row made offline before the first sync outranks the
  server's older one until the upload merges them.
- Writes go to the local row (made on the first write, with a UUIDv7) and upload through
  `sync.upload`. `ui` stays a sparse JSON text column of what the user changed. The handler
  validates with the same schemas as `preferences.update` and calls the same operation, so a row
  id made by any device merges into the user's single row, `ui` key by key. Deletes are refused.
  A foreign avatar id is refused as `MEDIA_REFERENCE_INVALID`.
- The oRPC procedures `preferences.get`, `update` and `locale` stay for older app builds. Both
  paths write the same table, so the streams carry an old build's change to a new one.
- The local row is seeded by the stream; there is no separate copy step. The device copy in
  storage (`preferences-cache`) is removed.

## Consequences

- A device uploads only the keys a write changed. The row has a local-only `patch` column (JSON:
  the changed `locale`, `timezone`, `ui` keys, an explicit `null` kept, plus a `writtenAt` stamp) and
  `patch` is the only column `sync.upload` carries; the merged columns are the local view. The
  server applies the patch key by key, so a stale value never overwrites another device's newer
  edit, and a cleared time zone survives the first insert, where PowerSync drops NULL columns. The
  avatar is checked only when a patch changes it. Same-key conflicts: last write wins.
- Reads and writes need the session user to be the Device owner (when there is a session): another
  account's session on the device reads nothing and cannot write, and the write transaction checks
  the owner and the install id again.
- Preferences uploaded after the media row of an avatar rely on the queue's order: both go in the
  order they were written.
- The server stays the owner of `updated_at`; the stream omits it.
