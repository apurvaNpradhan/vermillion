import { createdAt, deletedAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import {
  POSITION_KEY_MAX,
  REST_SECONDS_MAX,
  TRAINING_LIMITS,
  type PlannedSet,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

import { exercise } from "../exercise/tables";

const raw = (value: number) => sql.raw(String(value));
const { titleMin, titleMax, noteMax, descriptionMax } = TRAINING_LIMITS;

const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/**
 * Training plans (ADR 0036). Every table is user-owned and synced through the `my_training`
 * stream; users delete rows by setting `deleted_at` (soft delete, ADR 0019) and the stream
 * excludes them. Length CHECKs mirror the zod caps in `@workspace/shared`.
 */
export const program = pgTable(
  "program",
  {
    id: id(),
    userId: owner(),
    title: text("title").notNull(),
    description: text("description"),
    plannedWeeks: smallint("planned_weeks"),
    /** Stays null until covers can be uploaded; the photo lives on the device meanwhile. */
    coverKey: text("cover_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("program_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "program_title_length",
      sql`char_length(${table.title}) BETWEEN ${raw(titleMin)} AND ${raw(titleMax)}`,
    ),
    check(
      "program_description_length",
      sql`char_length(${table.description}) <= ${raw(descriptionMax)}`,
    ),
    check(
      "program_planned_weeks_range",
      sql`${table.plannedWeeks} BETWEEN ${raw(TRAINING_LIMITS.plannedWeeksMin)} AND ${raw(TRAINING_LIMITS.plannedWeeksMax)}`,
    ),
  ],
);

/** A Workout: standalone (`program_id` null) or owned by exactly one Program. Null title = derived. */
export const workout = pgTable(
  "workout",
  {
    id: id(),
    userId: owner(),
    programId: uuid("program_id").references(() => program.id, { onDelete: "cascade" }),
    title: text("title"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("workout_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("workout_program_id_idx").on(table.programId),
    check(
      "workout_title_length",
      sql`char_length(${table.title}) BETWEEN ${raw(titleMin)} AND ${raw(titleMax)}`,
    ),
    check("workout_note_length", sql`char_length(${table.note}) <= ${raw(noteMax)}`),
  ],
);

/**
 * One exercise in a Workout: ordered by a fractional `position` key (then id), with its Planned
 * sets as one JSON array written as a unit. `exercise_id` has no cascade: exercises are never
 * deleted.
 */
export const workoutExercise = pgTable(
  "workout_exercise",
  {
    id: id(),
    userId: owner(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workout.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id),
    position: text("position").notNull(),
    /** Seconds; null means rest is off. */
    restSeconds: smallint("rest_seconds"),
    note: text("note"),
    supersetGroup: uuid("superset_group"),
    sets: jsonb("sets")
      .$type<PlannedSet[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("workout_exercise_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("workout_exercise_order_idx")
      .on(table.workoutId, table.position, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "workout_exercise_position_length",
      sql`char_length(${table.position}) BETWEEN 1 AND ${raw(POSITION_KEY_MAX)}`,
    ),
    check(
      "workout_exercise_rest_range",
      sql`${table.restSeconds} BETWEEN 0 AND ${raw(REST_SECONDS_MAX)}`,
    ),
    check("workout_exercise_note_length", sql`char_length(${table.note}) <= ${raw(noteMax)}`),
    check(
      "workout_exercise_sets_shape",
      sql`jsonb_typeof(${table.sets}) = 'array' AND jsonb_array_length(${table.sets}) <= ${raw(TRAINING_LIMITS.setsPerExercise)}`,
    ),
  ],
);

/** One step of a Program's Rotation: one of its Workouts, or Rest when `workout_id` is null. */
export const programSlot = pgTable(
  "program_slot",
  {
    id: id(),
    userId: owner(),
    programId: uuid("program_id")
      .notNull()
      .references(() => program.id, { onDelete: "cascade" }),
    workoutId: uuid("workout_id").references(() => workout.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("program_slot_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("program_slot_order_idx")
      .on(table.programId, table.position, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "program_slot_position_length",
      sql`char_length(${table.position}) BETWEEN 1 AND ${raw(POSITION_KEY_MAX)}`,
    ),
  ],
);
