# Audit A: server, sync and security (2026-11-27)

Pre-release audit of `git diff origin/main...HEAD` (worktree on `feat/redesign` at `87ac951ce`),
limited to `packages/api`, `packages/sync`, `packages/auth`, `packages/db` (migrations),
`packages/client`, `powersync/`, `packages/env`, `apps/server` and `scripts/ops/`. Read-only: no
source changed. Two single-purpose seam-1 probes were run against the local stack and deleted
afterwards (results below).

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 3     |
| Low      | 13    |

| Verdict | Count | Findings          |
| ------- | ----- | ----------------- |
| FIX NOW | 6     | F1–F6             |
| LATER   | 7     | F7–F13            |
| SKIP    | 3     | F14–F16           |

No ownership hole was found. Every new upload handler (`program_slot_skip`, `gym`,
`gym_exercise_setting`, `exercise_pin`, the new Run, Program, Workout, Session, Session exercise
and exercise setting columns, preferences `hintDismissal`) checks the writer against the row and
every referenced parent. Every new stream filters `user_id = auth.user_id()` and lists its columns.
Every new JSON column is parsed with a shared zod schema before it is stored. `packages/auth`,
`packages/env`, `apps/server`, the auth config, the oRPC builders, rate limits and the media
procedures (presigned URLs, private bucket) are unchanged in this range.

## Findings

### F1 · Medium · FIX NOW: a Run's `started_at` is last-write-wins, so the bug the repair script fixes comes back

`packages/api/src/training/run-sync.ts:195` (`startedAt: date(values.started_at)`)

The client only moves `program_run.started_at` earlier (`packages/sync/src/training/sessions/session-store.ts:209`),
but the server takes whatever the last upload says. Two devices offline on the same Run: B logs a
Session on Nov 3 and PATCHes `started_at = Nov 3`; A logs one on Nov 10 and PATCHes
`started_at = Nov 10`. If A uploads last, the Run starts on Nov 10, every Run week (and so every
phase, Deload and Test week) shifts by a week, and B's Session falls before the Run. That is the
state `scripts/ops/repair-run-started-at.sh` repairs, so the repair only lasts until the next
offline overlap. Old app builds in the field produce it too.

**Probe (seam 1, deleted after):** the sequence above left `started_at = 2026-11-10 08:00:00+00`.

**Fix:** for an existing row, store the earlier of the stored and the incoming non-null
`started_at` (a null never clears a stored start). Add a phase-sync test with both upload orders.

### F2 · Medium · FIX NOW: the upload contract grew but `SYNC_SCHEMA_VERSION` stayed 1

`packages/shared/src/sync.ts:12`

This release adds four synced tables (`gym`, `gym_exercise_setting`, `program_slot_skip`,
`exercise_pin`), a pseudo-column (`program_run.deload_change`) and about fifteen columns. An API
that predates them (an API rollback after the app ships, which ADR 0007 expects since migrations are
not undone) answers those writes with permanent refusals, `SYNC_UNKNOWN_TABLE` and
`SYNC_INVALID_OP`. The device parks them in `rejected_writes`. Sync-down then removes the rows the
server never stored, such as skips, pins, gyms and kit moves. The version check exists so that an
old server answers `SYNC_CLIENT_INCOMPATIBLE` instead, which keeps the queue.

**Fix:** set `SYNC_SCHEMA_VERSION = 2` and keep `SYNC_MIN_SCHEMA_VERSION = 1`, so the new server
accepts 1 to 2. Check that the client's `incompatible` handling keeps writes queued (ADR 0018) and
that the "update required" copy still makes sense when the server is the older side.

### F3 · Medium · FIX NOW: no cap on gyms per account

`packages/api/src/training/gym-sync.ts:109` (create path, no `assertRoom`); the comment at
`packages/shared/src/training/logging/session-inputs.ts:247` says "The most gyms one user keeps",
but `GYM_LIMITS` holds only `nameMax`. `gym-sync.test.ts:278` asserts gyms "beyond the old account
limit".

Every other user-owned plan table has a live cap (`livePrograms` 100, `liveWorkouts` 500,
`skipsPerRun` 1000). A scripted client can create gyms without bound. Each new gym copies the active
kit and can hold a setting per exercise, and all of it rides the `my_training` stream to every
device. The kit itself has no per-user cap either (that predates this release).

**Fix:** add a generous `GYM_LIMITS.liveGyms` (for example 50) and call
`assertRoom(countLiveGyms(...), 1, …)` on create and on restore, under the lock already held. Make
`createGym` (`packages/sync/src/training/gyms/gym-store.ts:67`) refuse at the same cap so the UI
never queues a write it knows is refused. Replace the "beyond the old account limit" test with
"refuses the gym past the cap". Consider a per-gym kit cap in the same change.

### F4 · Low · FIX NOW: deleting a gym scans every user's Sessions

`packages/api/src/training/operations/gyms.ts:73` (`UPDATE training_session SET gym_id = NULL WHERE gym_id = $1`).
`gyms.ts:70` filters `gym_exercise_setting` by `gym_id` alone.

`training_session.gym_id` has no index and the statement has no `user_id` filter. The update is a
sequential scan of the whole `training_session` table, inside the upload transaction, while the
user's training lock is held. `gym_exercise_setting` is indexed only by `(user_id, gym_id, exercise_id)`,
which a filter on `gym_id` alone cannot use well.

**Fix:** pass `userId` to `deleteGymCascade` and add `eq(table.userId, userId)` to all four
statements. That uses the existing user indexes and needs no migration. A partial index on
`training_session (gym_id) WHERE gym_id IS NOT NULL` is optional.

### F5 · Low · FIX NOW: "Export data" leaves out everything this release added

`packages/sync/src/platform/backup.ts:9-53` (`BACKUP_TABLES`)

The export lists fixed columns per table and has not been updated. These tables are missing:
`gym`, `gym_exercise_setting`, `program_slot_skip` and `exercise_pin`. These columns are missing:
`program.phase_plan`; `workout.cover_media_id` and `main_entry_id`; `program_run.inserted_deloads`
and `pauses`; `training_session.gym_id`, `phase` and `phase_modifiers`;
`session_exercise.stall_deload` and `prescription`; `gym_equipment.gym_id`. A user who exports
before a reinstall or for their own records silently loses gyms, phase plans and per-gym settings.

**Fix:** add the tables and columns (the stream column lists in `powersync/sync-config.yaml` are the
reference). Extend `backup.test.ts` to compare the export's columns with the stream columns, so the
next new column fails a test instead of being missed.

### F6 · Low · FIX NOW: the repair script trusts `run_id` across owners and runs only once

`scripts/ops/repair-run-started-at.sh:28-31`

The subquery groups `training_session` by `run_id` and does not check that the Session belongs to
the Run's owner. The server refuses a foreign `run_id` today (`checkSessionRun`), but the script
repairs historical data that older servers wrote. Separately, the runbook says to run it once
before the deploy. Old builds keep producing late starts until they update, and F1 keeps producing
them until it is fixed.

**Fix:** group by `run_id, user_id` and join on `f.user_id = r.user_id`. In `docs/runbook.md`, say
to run it again after the deploy, or once F1 ships, say why a second run is not needed.

### F7 · Low · LATER: a gym PUT of an existing row resets its availability when the fields are absent

`packages/api/src/training/gym-sync.ts:105-117`

`unavailable_equipment` and `dumbbell_max_kg` are optional on upload (`.agents/sync.md`, Gyms), but
a PUT of an existing gym writes `[]` and `null` when they are absent. Every other column this release
adds keeps the stored value when a PUT omits it (`phase_plan`, `main_entry_id`, `cover_media_id`,
`progression_rule`, `unit`). No current client omits them, so nothing breaks today. A later build
or a restore path that leaves them out would clear a gym's equipment limits.

**Fix:** keep the stored values for an existing row when a field is absent. Default them only on
insert.

### F8 · Low · LATER: a Session PUT from an older app clears `gym_id`, `phase` and `phase_modifiers`

`packages/api/src/training/session-sync.ts:125-128` (`.default(null)` on all three)

An older build restores a deleted Session (Undo) with a PUT built from its local row, which has no
such columns. The PUT nulls the stored gym, phase and phase snapshot. The Session then counts for
"any gym" and reads its phase from the current plan instead of the snapshot it started with.

**Fix:** make the three fields `.optional()` in `putSession`, keep the stored values on an existing
row, and default to null only on insert. This is the same rule F7 asks for.

### F9 · Low · LATER: `sync.credentials` takes the training lock and a write transaction on every token renewal

`packages/api/src/platform/sync/procedures.ts:69`

`ensureDefaultGym` runs inside a transaction that takes `lockUserTraining` on every credentials call.
Each device renews about every five minutes. A long upload that holds the lock delays token renewal,
and every renewal opens a write transaction for a row that almost always exists already.

**Fix:** read `defaultGymId` without the lock first, and lock and create only when the account has
no gym.

### F10 · Low · LATER: the hourly cover sweep re-checks every live cover

`packages/api/src/training/cover-cleanup.ts:48-85`

The candidates are every live cover with `cover_unreferenced_at IS NULL`, which includes every
cover that is in use. Each one gets two correlated `NOT EXISTS` subqueries on `program` and
`workout`, and neither table has an index on `cover_media_id`, so the subqueries rely on the
`user_id` indexes. This is fine at beta scale and grows with the number of covers.

**Fix:** when it matters, add partial indexes `program (cover_media_id) WHERE deleted_at IS NULL`
and the same on `workout`.

### F11 · Low · LATER: a removed cover stays in the bucket for at least 7 days

`packages/api/src/media/sync.ts:32`

A cover DELETE is now acknowledged and ignored. Only the sweep retires a cover, after a 7-day grace
period plus the purge's hour. A user who removes a cover photo still has its object for about a
week. This is deliberate (`.agents/media.md`) and is the price of copies sharing covers.

**Fix:** check that the privacy policy and the delete-account page do not promise immediate
removal of a single image. Account deletion is unaffected because it purges the whole prefix.

### F12 · Low · LATER: seam 3 does not cover most of the new synced surface

`tests/sync/src/training.test.ts`, `docs/guides/sync-support-matrix.md:3` (last run 2026-11-09)

Among the new tables, only slot skips run through real PowerSync on two devices. Nothing at seam 3
covers gyms (default gym from credentials, kit copy, the delete cascade reaching a second device),
`exercise_pin`, the phase columns, `deload_change` through a real CRUD `_metadata` entry, or
`prescription`. Seam 1 covers the handlers well, but the stream column lists and the client schema
for these tables are proven only by the parity test.

**Fix:** add one two-device seam-3 case each for gyms, pins and an inserted then undone Deload.
Update the support matrix.

### F13 · Low · LATER: cover cleanup tests cover Workout covers only

`packages/api/src/media/media.test.ts:688-757`

The sweep is tested with Workout covers. It is not tested with a Program cover, with the grace reset
on `restoreProgramCascade` (`cascade.ts:95-99`), or with two users. A wrong correlation
(`program.user_id = media.user_id`) would let one user's reference keep another user's cover alive,
or let it be retired.

**Fix:** add a Program-cover sweep case, a restore-during-grace case, and a two-user case.

### F14 · Low · SKIP: a stale offline create of a gym setting can overwrite a newer edit

`packages/api/src/training/gym-sync.ts:227-236`

Device A creates a setting and then edits its ranges (PATCH). Device B's offline create PUT arrives
later with different non-empty ranges and replaces A's newer edit. This is the documented merge
rule (`.agents/sync.md`, Gyms), and the deterministic id makes the result converge.

### F15 · Low · SKIP: "insert deload" is accepted on a finished Run

`packages/api/src/training/run-sync.ts:185-188`

`deload_change` with `insert` does not check `finished_at` or `outcome`, while slot skips refuse a
finished Run. Readers ignore phases on a finished Run, so it is harmless.

### F16 · Low · SKIP: `program_run.undone_deloads` has no shape CHECK

`packages/db/src/migrations/20261126164128_run_deload_undo/migration.sql`

Unlike `inserted_deloads`, the column has no CHECK. Only the server writes it, from validated weeks
bounded by `PHASE_WEEK_MAX`, and it is not streamed.

## Checked and fine

- **Streams:** `my_exercise_pins` and the new `my_training` queries filter `user_id = auth.user_id()`
  and `deleted_at IS NULL`, with explicit columns. `undone_deloads` is server-only and deliberately
  left out of the stream; the parity test records this.
- **Publication and grants:** `program_slot_skip`, `gym`, `gym_exercise_setting` and `exercise_pin`
  are added to the `powersync` publication and granted to `powersync_replication` in the migration
  that creates them. The new columns on existing tables ride the table-level publication.
- **Migrations:** they only add, or widen a CHECK (`media_kind_known`, `gym_equipment_kind_known`).
  The gym backfill uses `uuidv7()`, which needs Postgres 18 (compose and production). Kit that an
  old API container writes with `gym_id` NULL during the deploy window reads as the default gym
  (`gym-store.ts:93`, `phase-inputs.ts:59`, `session-watch.ts:940`).
- **Account deletion with the new FKs:** `program_slot_skip` → `program_run` and `program_slot`,
  and `gym_equipment` and `gym_exercise_setting` → `gym`, are NO ACTION, checked at the end of the
  statement. **Probe (seam 1, deleted after):** `DELETE FROM "user"` with a Run, a skip, a second gym
  and kit in it succeeded and left no rows. Training handlers purge no tombstones, so no hard delete
  runs into these FKs.
- **Deterministic ids:** skips use UUIDv5 of Run, Slot and Cycle. Gym settings and pins include the
  user id. Each handler recomputes the id from the payload and refuses a mismatch, and a foreign
  owner gets `SYNC_ROW_NOT_FOUND` or `SYNC_ID_CONFLICT`.
- **JSON columns:** `phase_plan`, `inserted_deloads`, `pauses`, `phase_modifiers`, `prescription`,
  `progression_rule`, `load_ranges` and `unavailable_equipment` are parsed with the shared schemas
  through `jsonText` or equivalent, with byte and length caps. The DB CHECKs back up the shape.
- **PATCH and PUT merges for old clients:** an omitted `phase_plan`, `main_entry_id`,
  `cover_media_id`, `prescription`, `stall_deload`, `unit` or `progression_rule` keeps the stored
  value (except F7 and F8). `inserted_deloads` unions, and an explicit undo is recorded in
  `undone_deloads` so a legacy snapshot cannot bring the week back. Pauses merge by start instant.
- **Media:** `resolveCover` scopes to the writer's media and kind. A copy of a retired cover is
  stored with no cover. New references to a tombstoned cover are refused. Grace resets happen under
  the training lock that the sweep also takes.
- **Preferences:** `hintDismissal` is an enum of known ids. The new `ui` arrays are bounded, and
  `activeGymId` is a plain reference that readers resolve against the user's own gyms.
- **`packages/client`:** removing the Share-link return location narrows the accepted deep links.
- **Secrets and env:** no new `process.env` or `import.meta.env` reads outside `packages/env` in
  scope (`apps/native/app.config.ts` is Expo config).

## FIX NOW batches

Each batch touches its own files, so the three can be built in parallel.

| Batch | Findings | Files |
| ----- | -------- | ----- |
| **A: training handlers** | F1, F3, F4 | `packages/api/src/training/run-sync.ts`, `gym-sync.ts`, `operations/gyms.ts`, `operations/lookup.ts` (if needed), `phase-sync.test.ts`, `gym-sync.test.ts`; `packages/shared/src/training/logging/session-inputs.ts` (`GYM_LIMITS`); `packages/sync/src/training/gyms/gym-store.ts` (+ test) and the native gym-create message if the cap needs copy (`en.json`). |
| **B: sync contract version** | F2 | `packages/shared/src/sync.ts`, the shared and connector tests that pin the version, and a check of the client's `incompatible` path in `packages/sync/src/platform/connector.ts`. ADR 0018 note. |
| **C: export and ops** | F5, F6 | `packages/sync/src/platform/backup.ts`, `backup.test.ts`; `scripts/ops/repair-run-started-at.sh`, `docs/runbook.md`. |

Deploy order is unchanged: run the repair dry run, deploy the API (migrations), then release the
app. With F2 in place, an API rollback after the app ships pauses uploads instead of refusing them.
