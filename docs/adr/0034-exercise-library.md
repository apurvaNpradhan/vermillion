# 0034. Exercise library: catalog, custom exercises, body map

Status: accepted (2026-11-09). Builds on [0019](0019-synced-table-conventions.md), [0021](0021-device-owner-and-account-lifecycle.md), [0023](0023-replication-setup.md) and [0028](0028-native-navigation-shell.md). Specs: [docs/specs/exercise-library/](../specs/exercise-library/).

## Context

The app needs an exercise library: browsable, searchable and filterable offline, the target of every logged set, and extensible with the user's own exercises. Two earlier projects tried this. The spike at `~/Workspace/projects/vermillion` (its ADRs 0025, 0026, 0028, 0030) got most decisions right and is the base here. Callus is not used.

The source is a third-party catalog file kept outside the repo: 455 exercises, one primary muscle group and a list of other muscle groups each (20 group slugs), 9 equipment slugs, 9 exercise types, a popularity priority, search keywords, aliases, instructions and titles in 17 languages, and an MP4 plus a thumbnail per exercise already copied to our R2 bucket (435 videos, 188 MB; 436 thumbnails, 7 MB).

## Decision

### Data

- **One `exercise` table** for the catalog and Custom exercises. `user_id IS NULL` is a catalog row (Reference data); a row with an owner is a Custom exercise. Catalog ids are the source's UUIDs, kept as they are; Custom exercise ids are UUIDv7 from the client.
- **Columns**: `id`, `user_id`, `title`, `primary_muscle`, `secondary_muscles text[]`, `equipment`, `exercise_type`, `is_full_bodyweight`, `rank`, `search_terms`, `aka`, `instructions`, `video_key`, `thumbnail_key`, `retired_at`, `created_at`, `updated_at`. Slugs are `text` with `CHECK` constraints, never Postgres enums: an added slug is an additive migration ([0007](0007-additive-migrations.md)).
- **The vocabulary is code.** The 20 muscle groups, 9 equipment kinds and 9 exercise types live in `packages/shared/src/exercise/` with i18n keys. No lookup tables are synced. Each exercise type maps to the set fields it records; the workout session uses that map.
- **English only.** The conversion keeps `en` titles and instructions. A second locale later adds an `exercise_translation` table and a locale-filtered stream; nothing existing changes.
- **Media by key.** Rows hold R2 keys; the base URL lives in `app.config.ts`.
- **Retire, never delete.** Catalog rows that leave the source file get `retired_at`; Custom exercises are archived (`retired_at`) and restored, never deleted. A device cannot know whether another, offline device has logged a set against an exercise, so deleting is never safe. Rows go only with the account.

### Seeding

- `scripts/catalog/convert-catalog.ts <path>` turns the source file into the committed `packages/api/src/exercise/data/exercises.json` (English only, renamed fields, URLs to keys, sorted by id). It is kept so the source can be re-converted.
- An importer validates the file with zod (known slugs, unique ids and titles, keys present), skips when the file's SHA-256 matches the last import (server-only `reference_import` table), upserts only changed catalog rows, retires rows missing from the file and restores ones that return, in one transaction.
- It runs in the migrate step, **after** the table is in the `powersync` publication. The spike found that rows already in a table when the publication starts covering it are not snapshotted by a running service.
- A unit test runs the importer's validation over the committed file in CI and asserts the count.

### Sync

- `exercise_catalog`: auto-subscribed, `priority: 3`, `WHERE user_id IS NULL`, retired rows included so history resolves. Global, so stored once by the service. About 0.5 MB per device.
- `my_library`: auto-subscribed, `priority: 1`, `WHERE user_id = auth.user_id()`, retired rows included. User data is usable before the catalog arrives.
- Both feed one client `exercise` table. Columns are listed, never `*`.
- An account switch wipes the device ([0021](0021-device-owner-and-account-lifecycle.md)) and downloads the catalog again; signing back in as the same account does not.
- The upload handler accepts only Custom exercise rows owned by the writer. It forces `rank`, `aka`, media keys and `search_terms` empty, checks slugs, limits (title 1–100 characters, instructions up to 2,000, 1,000 live Custom exercises) and refuses an `exercise_type` change once any set references the exercise.
- **No custom equipment.** Custom exercises pick from the 9 kinds.

### Search

- Plain `LIKE`, no FTS5. The query is split into words; each must match `title`, `aka` or `search_terms`. Order: title starts with the query, then `rank`, then title, then id.

### Body map

- Ported from the spike into `apps/native/src/body-map/` (one consumer, so not a package). It works at muscle-group level: each drawable group (17 of 20; `cardio`, `full_body` and `other` have none) maps to one or more art layers. Highlights are the art's own coloured muscle layers over the grey body, faded to the group's opacity, never tinted. Group icons are circular light discs zoomed to the group (per-group framing table). An intensity mode (0–1 per group) serves the later heat map. Taps report a group slug.
- **Licence gate (unchanged from the spike).** The interim layer art is not ours and must not reach users. Our own vector art replaces it before launch, behind the same props.

### Interface

- **Exercises is a tab route in the switcher menu**, not a direct pill tab. Its tab action is "New exercise". Search sits in the page header.
- **One library component, two modes**: `browse` (tap opens detail) and `pick` (multi-select, returns ordered ids) for the workout builder.
- **List**: square thumbnails, title, `primary muscle · equipment`, a Custom badge. Recent section (once history exists) above all exercises. A–Z by default, Popular as a remembered toggle.
- **Filter sheet**: muscle groups (body map or grouped list, optional "include secondary"), equipment grid, All, Custom or Archived; OR within a facet, AND across facets; a live result count.
- **States**: first sync, offline before first sync, no results (with "Create ‹query›"), archived empty, query error. None of them looks like another.
- **Detail**: one adaptive scroll, no tabs. With no history: video, title, chips, muscle map, form steps, "Swap for" (same primary muscle, other equipment), sticky "Add to workout". With history: the user's last session, best and trend first.
- **Media**: thumbnails are prefetched into expo-image's disk cache on an unmetered connection after the catalog syncs; videos load on the detail screen only.

### The contract training relies on

An `exercise_id` always resolves; exercises are never deleted; an exercise's type is fixed once a set uses it; pick mode returns ordered ids. Routines, workouts and sets are designed separately against this contract.

## Consequences

- **Open risk: data rights.** The catalog, its media and the interim body art are third-party. Shipping any of them to real users needs a licence or a replacement. Only the committed data file, the media keys and `apps/native/src/body-map/assets/interim` name them, so a replacement is a data and asset change, not a code change.
- An equipment slug or muscle group added later needs a code change, an i18n key and (for a group) body-map art, plus an additive `CHECK` migration.
- Prefetch treats Wi-Fi and Ethernet as unmetered because expo-network exposes no metered flag, so a metered hotspot over Wi-Fi is still prefetched on.
- Spike ADR 0025's FTS5 index, Postgres enum and `custom_equipment` table are not carried over.
