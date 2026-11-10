Sessions slice 7 implements active Programs, Run lifecycle and Cycle progress, plus Home and Train.

The data/sync commit is 67bdd95. The following UI commit includes this report and the device checklist.
Both commits have the requested Codex co-author trailer. Neither was pushed.

Migration: `20261110140549_loving_black_tarantula`, generated with `pnpm db:generate`.
The noninteractive Turbo invocation failed; repeating it with `TURBO_UI=true` succeeded.
The migration adds only `program_run`, its indexes/constraints, publication membership and the
replication SELECT grant. Existing Session linkage columns were already present.

The shared dev database was not migrated. Before enabling the updated PowerSync stream there,
run `pnpm db:migrate` with Turbo's terminal UI enabled, or start the API through the normal
migration-on-start deployment flow. Apply the migration before reloading PowerSync's stream.
No Metro, API or other server was started during implementation.

Decisions where the spec was silent:

- `continued_at` records Keep going across devices and suppresses further planned-end prompts
  for that Run. It preserves activation, start and finish dates.
- Run weeks start at 1 and advance every seven calendar days in the user's timezone, measured
  from the first Session. The end sheet becomes eligible after the full planned duration.
- Home uses Monday-based calendar weeks in the saved timezone, falling back to the device zone.
  Volume respects kg/lb and bodyweight preferences. The chart always receives eight buckets.
- Equal activation timestamps use the Run id as a deterministic tie-break. Every training
  write reconciles competing unfinished Runs before applying its own changes.
- Deleting a Program stops its unfinished Runs. Undo restores the plan, without reactivating it.
- History navigation uses a small typed helper with a safety comment while slice 4 lands.
  No History routes were created.
- Home uses the existing finished-Session watch and its 500-Session cap.
- Empty session already existed in Train's Create menu and was retained.

Verification:

- `pnpm lint`: passed.
- `pnpm typecheck`: passed. Stale i18n output was cleared and a forced rebuild also passed.
- `pnpm knip`: passed.
- `pnpm test`: passed, all 20 Turbo tasks. API: 32 files / 232 tests, including schema/stream
  parity and Run ownership / foreign-Program Slot refusals. Shared Cycle and Run-store tests pass.
  An intermediate repeated run timed out in an existing OpenAPI test and lost a worker to
  SIGKILL; the final complete run passed.
- `pnpm i18n:check`: passed.
- `pnpm test:sync`: deliberately not run. The new seam 3 test activates on one real headless
  device and waits for the same active Run on another.
- No Android device was available. Concrete checks were appended under Slice 7 in
  `device-checklist.md`, including offline activation, out-of-order Cycles, Rest, deletion,
  Rotation edits, planned-end actions, old Run dates, Home totals and accessibility.
- Pre-commit secret scan, formatting, lint and commit-message checks passed for the data commit.

Files touched, including the Home wrapper moved from the temporary dashboard:

- `apps/native/app/(app)/index.tsx`
- `apps/native/src/dashboard/dashboard-screen.tsx`
- `apps/native/src/dashboard/index.ts`
- `apps/native/src/session/index.ts`
- `apps/native/src/training/components/active-program-card.tsx`
- `apps/native/src/training/components/home-screen.tsx`
- `apps/native/src/training/components/program-screen.tsx`
- `apps/native/src/training/components/train-screen.tsx`
- `apps/native/src/training/components/training-home.tsx`
- `apps/native/src/training/index.ts`
- `apps/native/src/training/use-active-program.ts`
- `apps/native/src/training/use-home-training.ts`
- `docs/specs/sessions/device-checklist.md`
- `docs/specs/sessions/slice-7-implementation-report.md`
- `packages/api/src/platform/sync/parity.test.ts`
- `packages/api/src/training/run-sync.ts`
- `packages/api/src/training/session-sync.test.ts`
- `packages/api/src/training/session-sync.ts`
- `packages/api/src/training/sync.ts`
- `packages/api/src/training/tables.ts`
- `packages/client/src/sync-rejection.ts`
- `packages/db/src/migrations/20261110140549_loving_black_tarantula/migration.sql`
- `packages/db/src/migrations/20261110140549_loving_black_tarantula/snapshot.json`
- `packages/i18n/src/locales/en.json`
- `packages/shared/src/sync.ts`
- `packages/shared/src/training/cycle.test.ts`
- `packages/shared/src/training/cycle.ts`
- `packages/shared/src/training/index.ts`
- `packages/sync/src/index.ts`
- `packages/sync/src/platform/fake-database.ts`
- `packages/sync/src/platform/schema.ts`
- `packages/sync/src/sync.test.ts`
- `packages/sync/src/training/index.ts`
- `packages/sync/src/training/program-store.ts`
- `packages/sync/src/training/run-store.test.ts`
- `packages/sync/src/training/run-store.ts`
- `packages/sync/src/training/session-store.ts`
- `packages/sync/src/training/store-common.ts`
- `packages/sync/src/training/tables.ts`
- `powersync/sync-config.yaml`
- `tests/sync/src/program-runs.test.ts`
