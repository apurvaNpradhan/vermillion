# Sync

Local-first sync: PowerSync (self-hosted) replicates Postgres rows to SQLite on the device; writes queue locally and upload through `sync.upload`. Reasons: ADRs [0015](../docs/adr/0015-powersync-self-hosted.md)–[0027](../docs/adr/0027-sync-build-plan.md). Adding a table: [guide](../docs/guides/adding-a-synced-table.md).

## Layout

- `powersync/`: `service.yaml` (env-driven), `sync-config.yaml` (streams, edition 3).
- `packages/api/src/platform/sync/`: `sync.credentials` / `sync.upload` procedures, `registry.ts` (handler allowlist), `handler.ts`, receipts (`tables.ts`), bootstrap, slot lag, purge, parity.
- `packages/api/src/<vertical>/sync.ts`: the vertical's upload handler; it calls the vertical's operations.
- `packages/shared` (`sync.ts`): wire schemas, limits, `SYNC_SCHEMA_VERSION`. Runtime-neutral.
- `packages/sync`: client Drizzle (SQLite) schema per vertical under `src/<vertical>/`, row conversion, database factory.
- `apps/native/src/platform/local-database`: the encrypted database and the lifecycle wiring.
- `tests/sync`: seam 3 (`@workspace/sync-tests`).

## Rules

- Streams list columns explicitly, never `*`, and filter `user_id = auth.user_id()`; the one exception is Reference data such as the exercise catalog (`user_id IS NULL`, ADR 0034), which no client may write. Never trust a client `user_id`; handlers use the session user.
- Synced tables: UUIDv7 `id` made on the client, `user_id` with cascade. Rows that users can delete use a `deleted_at` soft delete: streams exclude deleted rows, and the purge job (a handler's `purgeTombstones`) hard-deletes content after 120 days but atomically keeps minimal deleted-id/owner markers until account deletion, so a late PUT cannot resurrect a purged row. Exercises are retired, never deleted, so their handler purges nothing (ADR 0034). The removed `notes` tables show the tombstone shape ([0035](../docs/adr/0035-remove-notes-example.md)).
- Slot skips use UUIDv5 of Run, Slot and Cycle so two offline copies of the same skip converge. Undo soft-deletes that id and re-skipping reuses it.
- App writes carry the install-id `writeScope` captured by their hook; check it inside the SQLite write transaction. The native app-tabs boundary remounts account-scoped UI when that identity changes across tabs.
- Forms send dirty fields only (changed since edit start), never the live row. Same-field conflicts: server application order. Exercise forms keep a draft (`apps/native/src/exercise/form/exercise-draft.ts`): baseline, values and the dirty-field patch. Rejected writes stay on the device until the user discards them, never expired (`use-rejected-exercises`). Manual checks: [walkthrough](../docs/guides/sync-ux-walkthrough.md).
- Order for a new table: additive migration (table, `ALTER PUBLICATION powersync ADD TABLE`, `GRANT SELECT` to `powersync_replication`), then the stream in `sync-config.yaml`, then clients. A stream before its publication entry breaks replication.
- Handlers are registered in `registry.ts`; an unregistered table is rejected. Limits are validated before work.
- The parity test must pass: Postgres, publication, stream columns, handlers and SQLite indexes agree.
- Local index on every sort or filter key, always `LIMIT` and page.
- Never `LEFT JOIN` a session, set or other large table's view on an indexed column. PowerSync tables are views over JSON, and SQLite will not use an expression index for the right side of a LEFT JOIN: every row scans the whole table, so the read grows with the square of the history. Use an inner join, a correlated subquery, or read the child rows by index into a `MATERIALIZED` CTE first (`SESSION_DETAIL_SQL`, `PICKED_ROWS`). `session-open-latency.test.ts` runs the Session screen's reads on real PowerSync and fails on a scan; measure a new read there (`SESSION_OPEN_REPORT=40,200,1000`).
- Never log row payloads, rejected-write payloads or tokens.
- Never wipe a device to fix sync; only server-confirmed account deletion wipes ([0021](../docs/adr/0021-device-owner-and-account-lifecycle.md)).
- No package imports both `@workspace/db` and `@workspace/sync` (lint boundary; test-only exceptions are listed there). Client Drizzle is pinned `0.45`, the server is on the catalog RC.
- Native needs a dev client; changing a native module or build flag bumps `NATIVE_STACK_REVISION`: [native-dev](../docs/guides/native-dev.md).
- Synthetic data only until the [privacy readiness](../docs/privacy-readiness.md) sign-off.

## Gyms

`gym`, `gym_exercise_setting`, `gym_equipment.gym_id` and `training_session.gym_id` ride the `my_training` stream. The server, not a device, creates the default "My gym": `sync.credentials` calls `ensureDefaultGym` under the user's training lock, and a kit item uploaded with no `gym_id` (an older app) is put in the oldest live gym. A migration backfilled existing kits into a "My gym". The active gym is `ui.activeGymId` (an unknown id reads as the oldest gym). A Session's `gym_id` is a plain reference: deleting a gym nulls it on the server and readers ignore a gym that is gone. The last gym cannot be deleted.

`gym` also carries `unavailable_equipment` (JSON text of the equipment types it lacks, `[]` = all) and `dumbbell_max_kg`; both are optional on upload and validated against `@workspace/shared` (`gymAvailabilityInput`).

Deleting a gym uploads one write, the gym row: its kit and settings can number more than one upload may hold (`SYNC_LIMITS.maxOps`), so the server's `deleteGymCascade` soft-deletes them, and local readers (the kit and settings queries, seeding, the kit copy) ignore rows whose gym is gone until that sync arrives. Making a gym copies the active gym's kit in transactions of at most `maxOps` rows, the gym with the first of them; a copy cut short leaves a gym with part of the kit.

From the first release, every `gym_exercise_setting` row requires the UUIDv5 id from `gymExerciseSettingId({ userId, gymId, exerciseId })` in `packages/shared`. Two devices that create the setting offline make the same row, so a later PATCH or DELETE from either finds it. Its PUT is an upsert (it revives a deleted row too, and merges into a live one: a non-empty range list or note replaces the stored one, clearing is a PATCH). `exercise_setting` has the same pre-existing two-device race (one row per exercise, random ids) and is left as is.

## Phases

`program.phase_plan`, `program_run.inserted_deloads`, `workout.main_entry_id` and `training_session.phase` ride the `my_training` stream. The two JSON columns travel as text like `workout_exercise.sets`; handlers parse them with the shared zod schemas (`phasePlanSchema`, `insertedDeloadsSchema`) and refuse anything else as `SYNC_INVALID_OP`. A Run PATCH of `inserted_deloads` is a union with the stored weeks, so two devices that each insert a Deload offline both keep theirs. `main_entry_id` is a plain reference (the exercise is written after the Workout, so it cannot be checked); a stale id reads as the first exercise. A PATCH never resets fields it does not carry: zod applies `.default()` inside `.partial()`, so a patch schema must not reuse a schema with defaults. `phase_plan` is replaced whole by a write (last write wins, unlike `inserted_deloads`): two devices that edit the plan offline do not merge field by field, and the later upload keeps its own plan. The schema strips keys a build does not know instead of refusing them, so an older app can still read and edit a Program whose plan a newer app wrote (the older app's PATCH of another field leaves the stored plan alone). A Run holds at most `TRAINING_LIMITS.insertedDeloadsMax` (52) inserted weeks: a union that would pass it is refused as `SYNC_INVALID_OP`. A Session keeps `phase_modifiers`, the modifiers and Test top style it started with, so editing the plan later does not change a Session already begun.

A Run's nullable `pauses` JSON holds start and resume timestamps. Uploads merge by the
start instant and keep the earliest known resume. A stale open interval cannot reopen a
closed one. An offline device can still re-pause a resumed Run if it uploads an open pause
with a different start instant. The Run clock subtracts whole local days from the union of
paused intervals. Starting a Workout in a paused Run closes its open pauses in the Session
transaction and uses the updated pauses to set the phase. Backfills inside a pause stay
outside the Run. After a gap of at least 14 days between counted Run Sessions, a scheduled
Test becomes Build for the rest of that Run week.

## Stall deloads

`session_exercise.stall_deload` is a nullable flag on the exact Session entry. It rides
`my_training` with the Session and keeps multiple entries of the same exercise independent.
Null is the old-row default. A Session entry marked as deloaded counts as training for the
break clock and as a load to build from. It starts a new stall episode. The stall detector uses
only later baseline Sessions, including when another Workout uses that entry as its fixed-rep
baseline.
Manual dismissal stays on the device for the current baseline Session only.

## Progression rule

`exercise_setting.progression_rule` is a nullable `jsonb` that rides `my_training` with the setting (JSON text on the wire and in SQLite). The handler parses it with `ruleConfigSchema` (`@workspace/shared`): a PUT that omits it keeps the stored rule, a PATCH of `null` clears it (Double), and an unknown rule, an out-of-range percent or text that is not JSON is `SYNC_INVALID_OP`. Readers map a rule they do not know to Double instead of failing. The setting's id and merge semantics are unchanged.

## Commands

```sh
pnpm db:start          # Postgres, bootstrap (one shot), PowerSync on 127.0.0.1:8090
pnpm sync:bootstrap    # rerun the idempotent bootstrap
pnpm test:sync-infra   # bootstrap, slot and probe tests (need db:start)
pnpm test:sync         # seam 3: stack and API running
# Linux host that drops container-to-host traffic (PowerSync logs PSYNC_S2204):
docker compose -f docker-compose.yml -f compose.linux.yml up -d --wait
```

`compose.linux.yml` runs PowerSync on the host network (still `127.0.0.1:8090`, override with `POWERSYNC_HOST_PORT`), so it reaches Postgres and the API's JWKS on loopback. Never use it for production.

Seam 3 suites (`tests/sync/src`): `exercise` (catalog and library streams, then the upload protocol on Custom exercises: round trip, isolation, ack loss, rejections, offline queue), `training` (the real store on two devices: plan round trip, offline reorder convergence, delete cascade and undo, isolation; the `my_training` stream, ADR 0036), `sessions` (the real session store on two devices: a tick made offline, kill and resume, replay, isolation, two devices ticking different sets, last-write-wins on one set, two active Sessions; ADR 0037, 0038), `media` (media rows and Program covers on two devices: round trip, replace, offline pick, delete, isolation and refused foreign references; the `my_media` stream, ADR 0040), `progress-photos` (a photo and its media on two devices: round trip, offline Check-in, delete of both, a refused foreign media; the `my_body` and `my_media` streams, ADR 0041), `races` (concurrent edits, refused deletes, foreign ids, rollback siblings), `compat` (schema window, old queued writes, local query plan, first-sync timing), `faults` (PowerSync stop/start, cut database sessions, dropped replication slot). Files run sequentially. `faults` disturbs shared services and runs only when `SYNC_TEST_POWERSYNC_CONTAINER` names the PowerSync container (CI sets `vermillion-powersync-1`); locally point it, with `SYNC_TEST_POWERSYNC_URL` and `SYNC_TEST_DATABASE_URL`, at a throwaway stack: a second PowerSync (`--network host`, its own port, replicating a scratch database with its own storage database) and an API on port 3000 using the same scratch database. Postgres itself is never restarted by the tests (it may be shared); the Postgres-loss case cuts every session of the database, including the replication connection. What each suite proves and what it cannot: [support matrix](../docs/guides/sync-support-matrix.md).

## Where to look

- Replay, limits, error codes: ADR 0018. Table conventions and conflicts: 0019. Credentials and JWT: 0017. Bootstrap: 0023. Tests: 0024. Alerts: 0025.
- Operating it: [runbook](../docs/runbooks/sync.md), [restore checklist](../docs/sync-restore-checklist.md), [deployment](../docs/deployment.md#sync-infrastructure).
- `media` ([guide](media.md)) is a synced table whose rows describe files outside Postgres; its bytes never ride the upload.
- `exercise` (`packages/api/src/exercise/`) is the reference synced table: a Reference-data catalog plus per-user Custom exercises, retire-never-delete, the catalog seeded into an empty table at startup (`pnpm --filter server catalog:import`) and maintained in the admin afterwards (ADR 0046); the admin export regenerates the seed file.
