import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import {
  activeRun,
  DEFAULT_REST_SECONDS,
  TRAINING_LIMITS,
  type SupersetChange,
  type SupersetItem,
} from "@workspace/shared";
import { asc, count, eq, isNull } from "drizzle-orm";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { needsRebalance, rebalanced, sortByPosition, type Positioned } from "./position";
import { programRun, program, programSlot, workout, workoutExercise } from "./tables";

export type TrainingDatabase = AbstractPowerSyncDatabase;

export type ProgramRow = typeof program.$inferSelect;
export type WorkoutRow = typeof workout.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercise.$inferSelect;
export type ProgramSlotRow = typeof programSlot.$inferSelect;

/** What a delete removed, so Undo can put it back with the same ids (the server restores them). */
export type DeletedWorkout = {
  workout: WorkoutRow;
  exercises: WorkoutExerciseRow[];
  slots: ProgramSlotRow[];
};
export type DeletedProgram = {
  program: ProgramRow;
  workouts: WorkoutRow[];
  exercises: WorkoutExerciseRow[];
  slots: ProgramSlotRow[];
};

/** A write would pass one of the {@link TRAINING_LIMITS}. */
export class TrainingLimitError extends Error {
  readonly limit: keyof typeof TRAINING_LIMITS;
  constructor(limit: keyof typeof TRAINING_LIMITS) {
    super(`Training limit reached: ${limit}`);
    this.name = "TrainingLimitError";
    this.limit = limit;
  }
}

/** Columns of the training tables the server accepts in an upload; the rest are local only. */
export const trainingUploadColumns = {
  program_run: new Set([
    "program_id",
    "activated_at",
    "started_at",
    "finished_at",
    "outcome",
    "continued_at",
  ]),
  program: new Set(["title", "description", "planned_weeks", "restore"]),
  workout: new Set(["program_id", "title", "note", "restore"]),
  workout_exercise: new Set([
    "workout_id",
    "exercise_id",
    "position",
    "rest_seconds",
    "note",
    "superset_group",
    "sets",
    "restore",
  ]),
  program_slot: new Set(["program_id", "workout_id", "position", "restore"]),
  training_session: new Set([
    "workout_id",
    "program_id",
    "run_id",
    "slot_id",
    "cycle",
    "title",
    "title_derived",
    "note",
    "started_at",
    "finished_at",
    "duration_s",
    "device_id",
    "rest_set_id",
    "rest_started_at",
    "rest_ends_at",
    "restore",
  ]),
  session_exercise: new Set([
    "session_id",
    "exercise_id",
    "exercise_title",
    "exercise_type",
    "source_workout_exercise_id",
    "position",
    "rest_seconds",
    "note",
    "superset_group",
    "log_effort",
    "restore",
  ]),
  session_set: new Set([
    "session_exercise_id",
    "position",
    "kind",
    "weight_kg",
    "reps",
    "duration_s",
    "distance_m",
    "floors",
    "steps",
    "rpe",
    "completed_at",
    "timer_started_at",
    "target",
    "restore",
  ]),
  gym_equipment: new Set(["kind", "weight_kg", "unit", "label", "count", "enabled", "restore"]),
  exercise_setting: new Set(["exercise_id", "bar_id", "log_effort", "restore"]),
} as const satisfies Record<string, ReadonlySet<string>>;

/** User-set values a new exercise is created with. */
export type TrainingPreferences = { defaultRestSeconds: number };
export const DEFAULT_PREFERENCES: TrainingPreferences = {
  defaultRestSeconds: DEFAULT_REST_SECONDS,
};

const clients = new WeakMap<TrainingDatabase, ReturnType<typeof open>>();

function open(database: TrainingDatabase) {
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema });
}

function local(database: TrainingDatabase) {
  const existing = clients.get(database);
  if (existing) return existing;
  const created = open(database);
  clients.set(database, created);
  return created;
}

export type Tx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];

/** Runs a write inside the SQLite write transaction, after the write-scope check (ADR 0021). */
export function write<T>(
  database: TrainingDatabase,
  expectedInstallId: string | undefined,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return local(database).transaction(async (tx) => {
    if (expectedInstallId !== undefined) {
      const [install] = await tx
        .select({ id: installMeta.id })
        .from(installMeta)
        .where(eq(installMeta.install_id, expectedInstallId))
        .limit(1);
      if (!install) throw new Error("The device account changed; reopen the screen");
    }
    await reconcileRuns(tx);
    return run(tx);
  });
}

export async function ownerOf(tx: Tx): Promise<string> {
  const [owner] = await tx
    .select({ userId: deviceOwner.user_id })
    .from(deviceOwner)
    .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
    .limit(1);
  if (!owner) throw new Error("No Device owner: sign in first");
  return owner.userId;
}

/** A row put back by Undo carries the explicit restore marker; the server refuses a plain PUT. */
export function marked<Row extends object>(row: Row) {
  return { ...row, restore: 1 };
}

export const nowIso = () => new Date().toISOString();

export function assertRoom(live: number, adding: number, limit: keyof typeof TRAINING_LIMITS) {
  if (live + adding > TRAINING_LIMITS[limit]) throw new TrainingLimitError(limit);
}

export async function totalOf(query: Promise<{ total: number }[]>) {
  const [row] = await query;
  return row?.total ?? 0;
}

export const liveWorkouts = (tx: Tx) => totalOf(tx.select({ total: count() }).from(workout));
export const livePrograms = (tx: Tx) => totalOf(tx.select({ total: count() }).from(program));
export const exercisesIn = (tx: Tx, workoutId: string) =>
  totalOf(
    tx
      .select({ total: count() })
      .from(workoutExercise)
      .where(eq(workoutExercise.workout_id, workoutId)),
  );
export const slotsIn = (tx: Tx, programId: string) =>
  totalOf(
    tx.select({ total: count() }).from(programSlot).where(eq(programSlot.program_id, programId)),
  );

/** The fields of the patch that differ from the stored row: a form's dirty fields. */
export function changedFields<Row extends object>(row: Row, patch: Partial<Row>): Partial<Row> {
  const stored = new Map(Object.entries(row));
  const changes: Partial<Row> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(stored.get(key))) {
      Object.assign(changes, { [key]: next });
    }
  }
  return changes;
}

// ---- Position lists ----

export const exerciseListOf = (tx: Tx, workoutId: string) =>
  tx
    .select({ id: workoutExercise.id, position: workoutExercise.position })
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, workoutId))
    .orderBy(asc(workoutExercise.position), asc(workoutExercise.id));

export const slotListOf = (tx: Tx, programId: string) =>
  tx
    .select({ id: programSlot.id, position: programSlot.position })
    .from(programSlot)
    .where(eq(programSlot.program_id, programId))
    .orderBy(asc(programSlot.position), asc(programSlot.id));

/** The superset-relevant fields of a Workout's exercises, in order. */
export const supersetRowsOf = (tx: Tx, workoutId: string): Promise<SupersetItem[]> =>
  tx
    .select({
      id: workoutExercise.id,
      superset_group: workoutExercise.superset_group,
      rest_seconds: workoutExercise.rest_seconds,
    })
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, workoutId))
    .orderBy(asc(workoutExercise.position), asc(workoutExercise.id));

export async function applySupersetChanges(tx: Tx, changes: readonly SupersetChange[]) {
  for (const { id, ...fields } of changes) {
    await tx.update(workoutExercise).set(fields).where(eq(workoutExercise.id, id));
  }
}

/** Renumbers a list whose keys grew long or collided, in the same transaction as the move. */
export async function rebalanceExercises(tx: Tx, items: Positioned[]): Promise<Positioned[]> {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(workoutExercise)
      .set({ position: change.position })
      .where(eq(workoutExercise.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

export async function rebalanceSlots(tx: Tx, items: Positioned[]): Promise<Positioned[]> {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(programSlot)
      .set({ position: change.position })
      .where(eq(programSlot.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

export async function assertProgramExists(tx: Tx, programId: string) {
  const [found] = await tx
    .select({ id: program.id })
    .from(program)
    .where(eq(program.id, programId))
    .limit(1);
  if (!found) throw new Error("The program is gone");
}

/** Resolve offline duplicates in the same transaction as the next Run or Session write. */
export async function reconcileRuns(tx: Tx) {
  const runs = await tx.select().from(programRun).where(isNull(programRun.finished_at));
  const active = activeRun(runs);
  for (const run of runs) {
    if (run.id !== active?.id)
      await tx
        .update(programRun)
        .set({
          finished_at: nowIso(),
          outcome: "stopped",
        })
        .where(eq(programRun.id, run.id));
  }
  return active;
}
