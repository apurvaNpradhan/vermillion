import type { PlannedSet } from "@workspace/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
