import type { Equipment, ExerciseType, MuscleGroup } from "../../exercise/vocabulary";

/** What a planned set is for. A kind is a label; partials and the like are notes. */
export const SET_KINDS = ["warmup", "working", "drop", "failure", "top", "backoff", "myo"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/** Effort is stored as RPE in halves, 6 to 10. */
export const EFFORT_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
export type EffortStep = (typeof EFFORT_STEPS)[number];

/** Reps in reserve for an RPE (10 - RPE). */
export function rpeToRir(rpe: number): number {
  return 10 - rpe;
}

/** The RPE of a number of reps in reserve. The conversion is its own inverse. */
export function rirToRpe(rir: number): number {
  return 10 - rir;
}

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** Exercises follow the account preference until they have a unit of their own. */
export function resolveExerciseUnit(
  preferred: WeightUnit,
  override: WeightUnit | null | undefined,
): WeightUnit {
  return override ?? preferred;
}

/**
 * Deprecated: the full-screen Timer is gone and every workout opens on its sets. "timer" stays a
 * valid value so stored preferences and older apps' writes still validate; nothing reads it.
 */
export const SESSION_VIEWS = ["sets", "timer"] as const;
export type SessionView = (typeof SESSION_VIEWS)[number];

/** The weekday a week starts on. Monday is the default; every weekly figure follows it. */
export const WEEK_STARTS = ["monday", "sunday", "saturday"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];
export const DEFAULT_WEEK_START: WeekStart = "monday";

/**
 * Where an exercise's Previous values come from: the Workout the Session was started from (the
 * default, and what Previous has always done), or any finished Session of the exercise.
 */
export const PREVIOUS_SOURCES = ["same_workout", "any_session"] as const;
export type PreviousSource = (typeof PREVIOUS_SOURCES)[number];
export const DEFAULT_PREVIOUS_SOURCE: PreviousSource = "same_workout";

/** How a duration is shown: `1:30`, or whole seconds (`90 s`). */
export const DURATION_FORMATS = ["clock", "seconds"] as const;
export type DurationFormat = (typeof DURATION_FORMATS)[number];

/** How a distance is shown. It is stored in metres. */
export const DISTANCE_UNITS = ["m", "km", "mi"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const EFFORT_SCALES = ["rpe", "rir"] as const;
export type EffortScale = (typeof EFFORT_SCALES)[number];

/** Rest after a warm-up set is this fixed short value; it is never stored. */
export const WARMUP_REST_SECONDS = 60;
export const REST_SECONDS_MAX = 600;
export const DEFAULT_REST_SECONDS = 120;

/** Caps of the plan tables. Postgres CHECKs, the zod schemas, the handler and forms use them. */
export const TRAINING_LIMITS = {
  titleMin: 1,
  titleMax: 100,
  noteMax: 1000,
  descriptionMax: 10000,
  plannedWeeksMin: 1,
  plannedWeeksMax: 52,
  /** Sessions per week a Program or the user aims for. */
  sessionsPerWeekMin: 1,
  sessionsPerWeekMax: 14,
  /** Live Workout exercises in one Workout. */
  exercisesPerWorkout: 40,
  setsPerExercise: 20,
  /** Live Slots in one Program's Rotation. */
  slotsPerProgram: 28,
  /** Live Programs and Workouts (standalone and owned) one account may hold. */
  livePrograms: 100,
  liveWorkouts: 500,
  /** Live Slot skips one Run may hold (one per Slot and Cycle). */
  skipsPerRun: 1000,
  /** The highest Cycle a skip may name. */
  cycleMax: 10_000,
  /** Deload weeks one Run may have inserted. */
  insertedDeloadsMax: 52,
} as const;

/**
 * Caps of the Session tables (ADR 0038). Postgres CHECKs, the zod schemas, the handler and the
 * store use them. `futureGraceSeconds` lets a phone whose clock runs a little fast still log "now".
 */
export const SESSION_LIMITS = {
  /** Live exercises in one Session. */
  exercisesPerSession: 40,
  setsPerExercise: TRAINING_LIMITS.setsPerExercise,
  titleMin: 1,
  titleMax: 100,
  noteMax: 1000,
  /** The override of a Session's duration, 24 h. */
  durationMaxSeconds: 86_400,
  /** A backfilled Session starts at most this many years ago. */
  backfillYears: 10,
  futureGraceSeconds: 900,
} as const;

/** A fractional-indexing key is base 62 digits; this caps its length in Postgres and in zod. */
export const POSITION_KEY_MAX = 100;
/** Past this length a list is rebalanced the next time it is written (see `position.ts`). */
export const POSITION_REBALANCE_LENGTH = 50;

export const MAX_WEIGHT_KG = 1000;

/** The context that decides whether an exercise counts as a barbell compound lift. */
export type RestContext = {
  equipment: Equipment;
  secondaryMuscles: readonly MuscleGroup[];
};

/**
 * Rest floors by exercise type: the one table that adjusts the default-rest preference. A rule
 * applies when the exercise has the equipment and, if `compound`, works more than one muscle.
 */
export const REST_FLOORS = [
  { exerciseType: "weight_reps", equipment: "barbell", compound: true, seconds: 180 },
] as const satisfies readonly {
  exerciseType: ExerciseType;
  equipment: Equipment;
  compound: boolean;
  seconds: number;
}[];

/**
 * The rest prefilled for a new Workout exercise: the preference, raised to a floor for barbell
 * compound lifts. Without a context only type-wide rules (none today) can apply.
 */
export function defaultRestSeconds(
  exerciseType: ExerciseType,
  preference: number,
  context?: RestContext,
): number {
  let seconds = preference;
  for (const rule of REST_FLOORS) {
    if (rule.exerciseType !== exerciseType || !context) continue;
    if (context.equipment !== rule.equipment) continue;
    if (rule.compound && context.secondaryMuscles.length === 0) continue;
    seconds = Math.max(seconds, rule.seconds);
  }
  return Math.min(seconds, REST_SECONDS_MAX);
}
