import type { ExerciseType, PlannedSet, SetKind, WeightUnit } from "@workspace/shared";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Client mirrors of the training tables in `packages/api/src/training/tables.ts`, all fed by the
 * `my_training` stream. `deleted_at` and `updated_at` stay on the server: a deleted row simply
 * leaves the stream. `restore` is a client-only column the stream never fills: the store sets it to 1
 * when Undo re-inserts a deleted row, which is the explicit restore marker of the upload (ADR 0019). Orderings are by `position` then `id`, so each list has a local index on its
 * parent and key (PowerSync stores rows as JSON, so an unindexed ORDER BY parses every row).
 */
export const program = sqliteTable(
  "program",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    planned_weeks: integer("planned_weeks"),
    cover_key: text("cover_key"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("program_created_at_idx").on(table.created_at)],
);

export const workout = sqliteTable(
  "workout",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    program_id: text("program_id"),
    title: text("title"),
    note: text("note"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("workout_program_id_idx").on(table.program_id),
    index("workout_created_at_idx").on(table.created_at),
  ],
);

export const workoutExercise = sqliteTable(
  "workout_exercise",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    workout_id: text("workout_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    position: text("position").notNull(),
    rest_seconds: integer("rest_seconds"),
    note: text("note"),
    superset_group: text("superset_group"),
    sets: text("sets", { mode: "json" }).$type<PlannedSet[]>().notNull().default([]),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("workout_exercise_order_idx").on(table.workout_id, table.position),
    index("workout_exercise_exercise_id_idx").on(table.exercise_id),
  ],
);

export const programSlot = sqliteTable(
  "program_slot",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    program_id: text("program_id").notNull(),
    workout_id: text("workout_id"),
    position: text("position").notNull(),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("program_slot_order_idx").on(table.program_id, table.position),
    index("program_slot_workout_id_idx").on(table.workout_id),
  ],
);

/**
 * Local-only (never synced or uploaded): the cover photo of a Program on this device. `id` is the
 * Program id (PowerSync requires one) and `uri` points at `program-covers/<programId>.jpg` in the
 * documents directory. `program.cover_key` stays null until covers can upload (ADR 0036).
 */
export const programCover = sqliteTable(
  "program_cover",
  {
    id: text("id").primaryKey().notNull(),
    program_id: text("program_id").notNull(),
    uri: text("uri").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("program_cover_program_id_idx").on(table.program_id)],
);

/**
 * Sessions (ADR 0037, 0038), fed by the same `my_training` stream. The server table is named
 * `training_session` because Better Auth owns `session`, and so is this one, which is the name
 * PowerSync and the upload use. Booleans are 0/1 integers and `target` is JSON text. A Logged set
 * is its own row, so a Tick is one small write; every list has a local index on its parent and
 * ordering key, and Previous and Records read through `session_exercise.exercise_id`.
 */
export const session = sqliteTable(
  "training_session",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    workout_id: text("workout_id"),
    program_id: text("program_id"),
    run_id: text("run_id"),
    slot_id: text("slot_id"),
    cycle: integer("cycle"),
    title: text("title").notNull(),
    title_derived: integer("title_derived", { mode: "boolean" }).notNull().default(true),
    note: text("note"),
    started_at: text("started_at").notNull(),
    finished_at: text("finished_at"),
    duration_s: integer("duration_s"),
    device_id: text("device_id").notNull(),
    rest_set_id: text("rest_set_id"),
    rest_started_at: text("rest_started_at"),
    rest_ends_at: text("rest_ends_at"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("session_started_at_idx").on(table.started_at),
    index("session_finished_at_idx").on(table.finished_at),
  ],
);

export const sessionExercise = sqliteTable(
  "session_exercise",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    session_id: text("session_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    exercise_title: text("exercise_title").notNull(),
    exercise_type: text("exercise_type").$type<ExerciseType>().notNull(),
    source_workout_exercise_id: text("source_workout_exercise_id"),
    position: text("position").notNull(),
    rest_seconds: integer("rest_seconds"),
    note: text("note"),
    superset_group: text("superset_group"),
    log_effort: integer("log_effort", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("session_exercise_order_idx").on(table.session_id, table.position),
    index("session_exercise_exercise_id_idx").on(table.exercise_id),
  ],
);

export const sessionSet = sqliteTable(
  "session_set",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    session_exercise_id: text("session_exercise_id").notNull(),
    position: text("position").notNull(),
    kind: text("kind").$type<SetKind>().notNull(),
    weight_kg: real("weight_kg"),
    reps: integer("reps"),
    duration_s: integer("duration_s"),
    distance_m: real("distance_m"),
    floors: integer("floors"),
    steps: integer("steps"),
    rpe: real("rpe"),
    completed_at: text("completed_at"),
    timer_started_at: text("timer_started_at"),
    target: text("target", { mode: "json" }).$type<PlannedSet | null>(),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("session_set_order_idx").on(table.session_exercise_id, table.position)],
);

/** The user's bars and plates. `unit` is the kit an item belongs to; weights are kilograms. */
export const gymEquipment = sqliteTable("gym_equipment", {
  id: text("id").primaryKey().notNull(),
  user_id: text("user_id").notNull(),
  kind: text("kind").$type<"bar" | "plate">().notNull(),
  weight_kg: real("weight_kg").notNull(),
  unit: text("unit").$type<WeightUnit>().notNull(),
  label: text("label"),
  count: integer("count"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  created_at: text("created_at").notNull(),
  restore: integer("restore"),
});

export const exerciseSetting = sqliteTable(
  "exercise_setting",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    bar_id: text("bar_id"),
    log_effort: integer("log_effort", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("exercise_setting_exercise_id_idx").on(table.exercise_id)],
);
