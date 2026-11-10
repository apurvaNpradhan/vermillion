import { createdAt, deletedAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import {
  EFFORT_STEPS,
  EXERCISE_TYPES,
  MAX_WEIGHT_KG,
  POSITION_KEY_MAX,
  REST_SECONDS_MAX,
  SESSION_LIMITS,
  SET_KINDS,
  TRAINING_LIMITS,
  WEIGHT_UNITS,
  type PlannedSet,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

/** A SQL list of string literals for an `IN (...)` check. */
const literals = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(","));

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * A Session (ADR 0037, 0038): the record of training, optionally started from a Workout. Named
 * `training_session` because Better Auth owns `session`. `workout_id`, `program_id`, `run_id` and
 * `slot_id` are plain references, not foreign keys: plans may be deleted while history stays.
 * There is no uniqueness rule on unfinished Sessions: two started offline must both arrive.
 */
export const session = pgTable(
  "training_session",
  {
    id: id(),
    userId: owner(),
    workoutId: uuid("workout_id"),
    programId: uuid("program_id"),
    runId: uuid("run_id"),
    slotId: uuid("slot_id"),
    cycle: integer("cycle"),
    title: text("title").notNull(),
    /** True until the user renames the Session: the title is then recomputed from its muscles. */
    titleDerived: boolean("title_derived").notNull().default(true),
    note: text("note"),
    startedAt: timestamptz("started_at").notNull(),
    finishedAt: timestamptz("finished_at"),
    /** The user's override of the clock duration, seconds. */
    durationS: integer("duration_s"),
    /** The install that owns the Session right now (Take over writes its own). */
    deviceId: uuid("device_id").notNull(),
    restSetId: uuid("rest_set_id"),
    restStartedAt: timestamptz("rest_started_at"),
    restEndsAt: timestamptz("rest_ends_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("session_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("session_user_started_at_idx").on(table.userId, table.startedAt.desc()),
    check("session_cycle_range", sql`${table.cycle} BETWEEN 1 AND 2147483647`),
    check(
      "session_title_length",
      sql`char_length(${table.title}) BETWEEN ${raw(SESSION_LIMITS.titleMin)} AND ${raw(SESSION_LIMITS.titleMax)}`,
    ),
    check("session_note_length", sql`char_length(${table.note}) <= ${raw(SESSION_LIMITS.noteMax)}`),
    check(
      "session_duration_range",
      sql`${table.durationS} BETWEEN 0 AND ${raw(SESSION_LIMITS.durationMaxSeconds)}`,
    ),
  ],
);

/**
 * One exercise of a Session, with the exercise's title and type copied so history reads without
 * the library. `exercise_id` has no cascade: exercises are never deleted.
 */
export const sessionExercise = pgTable(
  "session_exercise",
  {
    id: id(),
    userId: owner(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id),
    exerciseTitle: text("exercise_title").notNull(),
    exerciseType: text("exercise_type").notNull(),
    sourceWorkoutExerciseId: uuid("source_workout_exercise_id"),
    position: text("position").notNull(),
    /** Seconds; null means rest is off. */
    restSeconds: smallint("rest_seconds"),
    note: text("note"),
    supersetGroup: uuid("superset_group"),
    logEffort: boolean("log_effort").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("session_exercise_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("session_exercise_order_idx")
      .on(table.sessionId, table.position, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    index("session_exercise_exercise_id_idx").on(table.exerciseId),
    check(
      "session_exercise_title_length",
      sql`char_length(${table.exerciseTitle}) BETWEEN 1 AND 100`,
    ),
    check(
      "session_exercise_type_known",
      sql`${table.exerciseType} IN (${literals(EXERCISE_TYPES)})`,
    ),
    check(
      "session_exercise_position_length",
      sql`char_length(${table.position}) BETWEEN 1 AND ${raw(POSITION_KEY_MAX)}`,
    ),
    check(
      "session_exercise_rest_range",
      sql`${table.restSeconds} BETWEEN 0 AND ${raw(REST_SECONDS_MAX)}`,
    ),
    check(
      "session_exercise_note_length",
      sql`char_length(${table.note}) <= ${raw(SESSION_LIMITS.noteMax)}`,
    ),
  ],
);

/**
 * One Logged set, its own row so a Tick is one small write that cannot overwrite another set
 * (ADR 0037). Which value columns may be set depends on the exercise's snapshot type, which the
 * upload handler checks. `target` is the Planned set it was copied from.
 */
export const sessionSet = pgTable(
  "session_set",
  {
    id: id(),
    userId: owner(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercise.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    kind: text("kind").notNull(),
    weightKg: doublePrecision("weight_kg"),
    reps: integer("reps"),
    durationS: integer("duration_s"),
    distanceM: doublePrecision("distance_m"),
    floors: integer("floors"),
    steps: integer("steps"),
    /** Effort as RPE in halves. */
    rpe: doublePrecision("rpe"),
    /** Set when ticked; a ticked set always holds its required values. */
    completedAt: timestamptz("completed_at"),
    timerStartedAt: timestamptz("timer_started_at"),
    target: jsonb("target").$type<PlannedSet | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("session_set_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("session_set_order_idx")
      .on(table.sessionExerciseId, table.position, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "session_set_position_length",
      sql`char_length(${table.position}) BETWEEN 1 AND ${raw(POSITION_KEY_MAX)}`,
    ),
    check("session_set_kind_known", sql`${table.kind} IN (${literals(SET_KINDS)})`),
    check("session_set_weight_range", sql`${table.weightKg} BETWEEN 0 AND ${raw(MAX_WEIGHT_KG)}`),
    check("session_set_reps_range", sql`${table.reps} BETWEEN 1 AND 999`),
    check("session_set_duration_range", sql`${table.durationS} BETWEEN 1 AND 86400`),
    check("session_set_distance_range", sql`${table.distanceM} BETWEEN 0 AND 1000000`),
    check("session_set_floors_range", sql`${table.floors} BETWEEN 1 AND 10000`),
    check("session_set_steps_range", sql`${table.steps} BETWEEN 1 AND 1000000`),
    check("session_set_rpe_step", sql`${table.rpe} IN (${sql.raw(EFFORT_STEPS.join(","))})`),
    check(
      "session_set_target_shape",
      sql`${table.target} IS NULL OR jsonb_typeof(${table.target}) = 'object'`,
    ),
  ],
);

/**
 * One bar or plate of the user's kit for the plate calculator (ADR 0038). `unit` is the kit it
 * belongs to; the weight is always kilograms. `count` null means unlimited.
 */
export const gymEquipment = pgTable(
  "gym_equipment",
  {
    id: id(),
    userId: owner(),
    kind: text("kind").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    unit: text("unit").notNull(),
    label: text("label"),
    count: integer("count"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("gym_equipment_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    check("gym_equipment_kind_known", sql`${table.kind} IN ('bar','plate')`),
    check("gym_equipment_weight_range", sql`${table.weightKg} BETWEEN 0 AND ${raw(MAX_WEIGHT_KG)}`),
    check("gym_equipment_unit_known", sql`${table.unit} IN (${literals(WEIGHT_UNITS)})`),
    check("gym_equipment_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 100`),
    check("gym_equipment_count_range", sql`${table.count} BETWEEN 0 AND 1000`),
  ],
);

/** Per-exercise choices: the remembered bar and the effort column. One live row per exercise. */
export const exerciseSetting = pgTable(
  "exercise_setting",
  {
    id: id(),
    userId: owner(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id),
    barId: uuid("bar_id"),
    logEffort: boolean("log_effort").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("exercise_setting_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("exercise_setting_user_exercise_live_idx")
      .on(table.userId, table.exerciseId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Run dates survive plan edits and soft deletion. */
export const programRun = pgTable(
  "program_run",
  {
    id: id(),
    userId: owner(),
    programId: uuid("program_id")
      .notNull()
      .references(() => program.id),
    activatedAt: timestamptz("activated_at").notNull(),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    outcome: text("outcome"),
    continuedAt: timestamptz("continued_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("program_run_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("program_run_program_id_idx").on(table.programId),
    check(
      "program_run_outcome",
      sql`(${table.finishedAt} IS NULL AND ${table.outcome} IS NULL) OR (${table.finishedAt} IS NOT NULL AND ${table.outcome} IN ('completed', 'stopped'))`,
    ),
  ],
);
