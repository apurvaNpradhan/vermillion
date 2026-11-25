import type {
  ExerciseType,
  LoadRange,
  Phase,
  PhasePlan,
  PlannedSet,
  SetKind,
  WeightUnit,
} from "@workspace/shared";
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
    sessions_per_week: integer("sessions_per_week"),
    cover_media_id: text("cover_media_id"),
    /** The week phases as JSON; null is none. Validated by `phasePlanSchema` on write. */
    phase_plan: text("phase_plan", { mode: "json" }).$type<PhasePlan | null>(),
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
    cover_media_id: text("cover_media_id"),
    /** The main lift's `workout_exercise` id; null (or one no longer there) is the first. */
    main_entry_id: text("main_entry_id"),
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
    workout_structure: text("workout_structure"),
    program_id: text("program_id"),
    run_id: text("run_id"),
    slot_id: text("slot_id"),
    /** The gym trained at; null is any gym. A deleted gym reads as null (the server nulls it). */
    gym_id: text("gym_id"),
    /** The phase of the Run week it started in; Test and Deload are never a baseline. */
    phase: text("phase").$type<Phase>(),
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
    /** When the current pause began; null while the Session runs. */
    paused_at: text("paused_at"),
    /** Milliseconds of earlier pauses; null on rows from before pausing existed. */
    paused_ms: integer("paused_ms"),
    /** Set on Sessions written by a history import; Undo import deletes by it. */
    import_batch_id: text("import_batch_id"),
    import_fingerprint: text("import_fingerprint"),
    import_content: text("import_content"),
    // Write-only request. The server performs a guarded cascade under the training lock.
    import_undo: text("import_undo"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [
    index("session_started_at_idx").on(table.started_at),
    index("session_workout_started_idx").on(table.workout_id, table.started_at, table.id),
    index("session_import_batch_idx").on(table.import_batch_id, table.id),
    index("session_import_fingerprint_idx").on(table.import_fingerprint),
    index("session_run_id_idx").on(table.run_id, table.started_at, table.id),
    index("session_finished_at_idx").on(table.finished_at),
    index("session_gym_id_idx").on(table.gym_id),
  ],
);

export const historyImportReceipt = sqliteTable("history_import_receipt", {
  id: text("id").primaryKey().notNull(),
  receipt: text("receipt").notNull(),
});

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
    workout_swap_fragment: integer("workout_swap_fragment", { mode: "boolean" }),
    position: text("position").notNull(),
    rest_seconds: integer("rest_seconds"),
    note: text("note"),
    superset_group: text("superset_group"),
    log_effort: integer("log_effort", { mode: "boolean" }).notNull().default(false),
    /** The inputs the generated warm-up ramp was last built from (see `replaceWarmups`). */
    warmup_key: text("warmup_key"),
    /** Made by Perform again: its copied targets outrank Previous for the Ghost values. */
    repeated: integer("repeated", { mode: "boolean" }).notNull().default(false),
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
    /** A warm-up the ramp generator wrote, until the user types, ticks or edits it. */
    generated_warmup: integer("generated_warmup", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("session_set_order_idx").on(table.session_exercise_id, table.position)],
);

/** A place the user trains. The server creates "My gym" for every account. */
export const gym = sqliteTable("gym", {
  id: text("id").primaryKey().notNull(),
  user_id: text("user_id").notNull(),
  name: text("name").notNull(),
  /** JSON text: the equipment types this gym lacks. Empty or null: it has all of them. */
  unavailable_equipment: text("unavailable_equipment"),
  /** The heaviest dumbbell in kilograms, which caps every dumbbell exercise here. */
  dumbbell_max_kg: real("dumbbell_max_kg"),
  created_at: text("created_at").notNull(),
  restore: integer("restore"),
});

/**
 * The bars and plates of a gym's kit. `unit` is the kit an item belongs to; weights are
 * kilograms. `gym_id` is null on rows from before gyms existed: they belong to the default gym.
 */
export const gymEquipment = sqliteTable(
  "gym_equipment",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    gym_id: text("gym_id"),
    kind: text("kind").$type<"bar" | "plate">().notNull(),
    weight_kg: real("weight_kg").notNull(),
    unit: text("unit").$type<WeightUnit>().notNull(),
    label: text("label"),
    count: integer("count"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
    // Upload only: the first row ID of the automatic kit this item belongs to.
    seed: text("seed"),
  },
  (table) => [index("gym_equipment_gym_id_idx").on(table.gym_id)],
);

/** What one gym says about one exercise: its load ranges (the last `max` is the cap) and a note. */
export const gymExerciseSetting = sqliteTable(
  "gym_exercise_setting",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    gym_id: text("gym_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    load_ranges: text("load_ranges", { mode: "json" }).$type<LoadRange[]>().notNull(),
    setup_note: text("setup_note"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("gym_exercise_setting_exercise_id_idx").on(table.exercise_id, table.gym_id)],
);

export const exerciseSetting = sqliteTable(
  "exercise_setting",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    bar_id: text("bar_id"),
    log_effort: integer("log_effort", { mode: "boolean" }).notNull().default(false),
    progression_per_set: integer("progression_per_set", { mode: "boolean" })
      .notNull()
      .default(false),
    auto_warmups: integer("auto_warmups", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (table) => [index("exercise_setting_exercise_id_idx").on(table.exercise_id)],
);

export const programRun = sqliteTable(
  "program_run",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    program_id: text("program_id").notNull(),
    activated_at: text("activated_at").notNull(),
    started_at: text("started_at"),
    finished_at: text("finished_at"),
    outcome: text("outcome"),
    continued_at: text("continued_at"),
    /** Run weeks turned into Deload weeks ("Insert deload now") as JSON, ascending; null is none. */
    inserted_deloads: text("inserted_deloads", { mode: "json" }).$type<number[] | null>(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("program_run_program_id_idx").on(table.program_id),
    index("program_run_activated_at_idx").on(table.activated_at),
  ],
);

/** A Slot left out of one Cycle of a Run; counts as done for that Cycle (`cycleState`). */
export const programSlotSkip = sqliteTable(
  "program_slot_skip",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    run_id: text("run_id").notNull(),
    slot_id: text("slot_id").notNull(),
    cycle: integer("cycle").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [index("program_slot_skip_run_idx").on(table.run_id, table.cycle)],
);

export const sessionPhoto = sqliteTable(
  "session_photo",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    session_id: text("session_id").notNull(),
    media_id: text("media_id").notNull(),
    position: real("position").notNull(),
    restore: integer("restore"),
    created_at: text("created_at").notNull(),
  },
  (t) => [index("session_photo_session_position_idx").on(t.session_id, t.position, t.id)],
);
