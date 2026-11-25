import { createdAt, deletedAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import {
  EFFORT_STEPS,
  EXERCISE_TYPES,
  GYM_EQUIPMENT_CHOICES,
  GYM_LIMITS,
  LOAD_RANGES_MAX,
  MAX_WEIGHT_KG,
  PHASES,
  POSITION_KEY_MAX,
  REST_SECONDS_MAX,
  SESSION_LIMITS,
  SET_KINDS,
  TRAINING_LIMITS,
  WEIGHT_UNITS,
  type Equipment,
  type LoadRange,
  type Phase,
  type PhasePlan,
  type PhaseSnapshot,
  type PlannedSet,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
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
    /** The Sessions a week the Program aims for; null derives it from the rotation. */
    sessionsPerWeek: smallint("sessions_per_week"),
    /** Retired by ADR 0040: always null, kept because migrations are additive. */
    coverKey: text("cover_key"),
    /**
     * The cover's `media` row. No foreign key: a media can be deleted while this reference lags
     * on another device. The sync handler checks it belongs to the writer and is a program cover.
     */
    coverMediaId: uuid("cover_media_id"),
    /**
     * The week phases (Build, Push, Test, Deload): a repeating pattern, per-week overrides and
     * edits of each phase's modifiers, validated by `phasePlanSchema`. Null is no phases.
     */
    phasePlan: jsonb("phase_plan").$type<PhasePlan>(),
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
      "program_sessions_per_week_range",
      sql`${table.sessionsPerWeek} BETWEEN ${raw(TRAINING_LIMITS.sessionsPerWeekMin)} AND ${raw(TRAINING_LIMITS.sessionsPerWeekMax)}`,
    ),
    check(
      "program_phase_plan_shape",
      sql`${table.phasePlan} IS NULL OR jsonb_typeof(${table.phasePlan}) = 'object'`,
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
    /** The cover's `media` row (kind `workout_cover`); no foreign key, as for a Program cover. */
    coverMediaId: uuid("cover_media_id"),
    /**
     * The `workout_exercise` that is the main lift (a Test week's one top set). A plain
     * reference: the exercise is written after the Workout, so it cannot be checked here; a
     * stale id reads as the first exercise.
     */
    mainEntryId: uuid("main_entry_id"),
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
    workoutStructure: text("workout_structure"),
    programId: uuid("program_id"),
    runId: uuid("run_id"),
    slotId: uuid("slot_id"),
    /** The gym trained at; null is any gym. A plain reference: deleting a gym nulls it. */
    gymId: uuid("gym_id"),
    /** The phase of the Run week the Session started in; Test and Deload are never a baseline. */
    phase: text("phase").$type<Phase>(),
    /** The phase's modifiers when the Session started, so a later edit of the plan leaves it be. */
    phaseModifiers: jsonb("phase_modifiers").$type<PhaseSnapshot>(),
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
    /** When the current pause began; null while the Session runs. */
    pausedAt: timestamptz("paused_at"),
    /** Milliseconds of earlier pauses, which the duration leaves out. */
    pausedMs: bigint("paused_ms", { mode: "number" }).notNull().default(0),
    /** The history import that wrote the Session, so Undo import removes exactly its Sessions. */
    importBatchId: uuid("import_batch_id"),
    importFingerprint: text("import_fingerprint"),
    importContent: text("import_content"),
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
    check("session_phase_known", sql`${table.phase} IN (${literals(PHASES)})`),
    check(
      "session_phase_modifiers_shape",
      sql`${table.phaseModifiers} IS NULL OR jsonb_typeof(${table.phaseModifiers}) = 'object'`,
    ),
    check(
      "session_title_length",
      sql`char_length(${table.title}) BETWEEN ${raw(SESSION_LIMITS.titleMin)} AND ${raw(SESSION_LIMITS.titleMax)}`,
    ),
    check("session_note_length", sql`char_length(${table.note}) <= ${raw(SESSION_LIMITS.noteMax)}`),
    check("session_paused_ms_range", sql`${table.pausedMs} BETWEEN 0 AND 9007199254740991`),
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
    stallDeload: boolean("stall_deload"),
    /** Completed history left by a swap that already updated the source Workout. */
    workoutSwapFragment: boolean("workout_swap_fragment"),
    position: text("position").notNull(),
    /** Seconds; null means rest is off. */
    restSeconds: smallint("rest_seconds"),
    note: text("note"),
    supersetGroup: uuid("superset_group"),
    logEffort: boolean("log_effort").notNull().default(false),
    /** The inputs the generated warm-up ramp was last built from; null before the first ramp. */
    warmupKey: text("warmup_key"),
    /** Made by Perform again: its copied targets outrank Previous for the Ghost values. */
    repeated: boolean("repeated").notNull().default(false),
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
    /** A warm-up written by the ramp generator, until the user types, ticks or edits it. */
    generatedWarmup: boolean("generated_warmup").notNull().default(false),
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
 * A place the user trains. Every user has at least one: the server creates "My gym" when the
 * account first syncs, and the last gym cannot be deleted.
 */
export const gym = pgTable(
  "gym",
  {
    id: id(),
    userId: owner(),
    name: text("name").notNull(),
    /** Equipment types this gym lacks; empty (the default) means it has all of them. */
    unavailableEquipment: jsonb("unavailable_equipment")
      .$type<Equipment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The heaviest dumbbell in kilograms; caps every dumbbell exercise here. Null for no limit. */
    dumbbellMaxKg: doublePrecision("dumbbell_max_kg"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("gym_user_id_live_idx")
      .on(table.userId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "gym_name_length",
      sql`char_length(${table.name}) BETWEEN 1 AND ${raw(GYM_LIMITS.nameMax)}`,
    ),
    check(
      "gym_unavailable_equipment_shape",
      sql`jsonb_typeof(${table.unavailableEquipment}) = 'array' AND jsonb_array_length(${table.unavailableEquipment}) <= ${raw(GYM_EQUIPMENT_CHOICES.length)}`,
    ),
    check(
      "gym_dumbbell_max_range",
      sql`${table.dumbbellMaxKg} > 0 AND ${table.dumbbellMaxKg} <= ${raw(MAX_WEIGHT_KG)}`,
    ),
  ],
);

/**
 * One bar, plate or (later) rack or stack of a gym's kit for the plate calculator (ADR 0038).
 * `unit` is the kit it belongs to; the weight is always kilograms. `count` null means unlimited.
 * `gym_id` is null on rows written before gyms existed; the server fills the default gym in.
 */
export const gymEquipment = pgTable(
  "gym_equipment",
  {
    id: id(),
    userId: owner(),
    gymId: uuid("gym_id").references(() => gym.id),
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
    index("gym_equipment_gym_id_live_idx")
      .on(table.gymId)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "gym_equipment_kind_known",
      sql`${table.kind} IN ('bar','plate','dumbbell_rack','stack','add_on')`,
    ),
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
    unit: text("unit", { enum: WEIGHT_UNITS }),
    logEffort: boolean("log_effort").notNull().default(false),
    progressionPerSet: boolean("progression_per_set").notNull().default(false),
    autoWarmups: boolean("auto_warmups").notNull().default(false),
    note: text("note"),
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
    check("exercise_setting_unit_known", sql`${table.unit} IN (${literals(WEIGHT_UNITS)})`),
    check(
      "exercise_setting_note_length",
      sql`char_length(${table.note}) <= ${raw(SESSION_LIMITS.noteMax)}`,
    ),
  ],
);

/**
 * What one gym says about one exercise: `load_ranges` (`[{min,max,step}]` in kilograms, the last
 * `max` being the cap) and a setup note. One live row per gym and exercise.
 */
export const gymExerciseSetting = pgTable(
  "gym_exercise_setting",
  {
    id: id(),
    userId: owner(),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gym.id),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id),
    loadRanges: jsonb("load_ranges")
      .$type<LoadRange[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    setupNote: text("setup_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index("gym_exercise_setting_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("gym_exercise_setting_live_idx")
      .on(table.userId, table.gymId, table.exerciseId)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "gym_exercise_setting_ranges_shape",
      sql`jsonb_typeof(${table.loadRanges}) = 'array' AND jsonb_array_length(${table.loadRanges}) <= ${raw(LOAD_RANGES_MAX)}`,
    ),
    check(
      "gym_exercise_setting_note_length",
      sql`char_length(${table.setupNote}) <= ${raw(SESSION_LIMITS.noteMax)}`,
    ),
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
    /** Run weeks turned into Deload weeks by "Insert deload now", ascending; null is none. */
    insertedDeloads: jsonb("inserted_deloads").$type<number[]>(),
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
      "program_run_inserted_deloads_shape",
      sql`${table.insertedDeloads} IS NULL OR (jsonb_typeof(${table.insertedDeloads}) = 'array' AND jsonb_array_length(${table.insertedDeloads}) <= ${raw(TRAINING_LIMITS.insertedDeloadsMax)})`,
    ),
    check(
      "program_run_outcome",
      sql`(${table.finishedAt} IS NULL AND ${table.outcome} IS NULL) OR (${table.finishedAt} IS NOT NULL AND ${table.outcome} IN ('completed', 'stopped'))`,
    ),
  ],
);

/**
 * A Slot a user deliberately left out of one Cycle of a Run ("Skip this cycle"). Counts as done
 * for that Cycle in `cycleState`; the Program order never changes. Undo is a soft delete.
 */
export const programSlotSkip = pgTable(
  "program_slot_skip",
  {
    id: id(),
    userId: owner(),
    runId: uuid("run_id")
      .notNull()
      .references(() => programRun.id),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => programSlot.id),
    cycle: integer("cycle").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("program_slot_skip_user_id_live_idx")
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("program_slot_skip_run_idx").on(t.runId, t.cycle),
    check(
      "program_slot_skip_cycle_range",
      sql`${t.cycle} BETWEEN 1 AND ${raw(TRAINING_LIMITS.cycleMax)}`,
    ),
  ],
);

/** Images of one Session, ordered independently of its logged exercises. */
export const sessionPhoto = pgTable(
  "session_photo",
  {
    id: id(),
    userId: owner(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id),
    mediaId: uuid("media_id").notNull(),
    position: doublePrecision("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("session_photo_user_id_live_idx")
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("session_photo_session_position_idx").on(t.sessionId, t.position, t.id),
  ],
);
