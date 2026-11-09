// Plain constants only: no imports, so repo scripts can load this file directly.

/** The muscle groups of the exercise library. A slug is `text` in Postgres, never an enum. */
export const MUSCLE_GROUPS = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "forearms",
  "full_body",
  "glutes",
  "hamstrings",
  "lats",
  "lower_back",
  "neck",
  "other",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
  "upper_back",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Equipment kinds. Custom exercises pick from these; there is no custom equipment. */
export const EQUIPMENT = [
  "none",
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "plate",
  "resistance_band",
  "suspension",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Exercise types: each decides which fields a logged set records (see `SET_FIELDS`). */
export const EXERCISE_TYPES = [
  "weight_reps",
  "reps_only",
  "bodyweight_reps",
  "bodyweight_assisted_reps",
  "duration",
  "distance_duration",
  "short_distance_weight",
  "floors_duration",
  "steps_duration",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const MUSCLE_REGIONS = ["upper", "lower", "other"] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

/** Which region of the filter sheet a muscle group is listed under. Core groups count as lower. */
export const MUSCLE_REGION = {
  abdominals: "lower",
  abductors: "lower",
  adductors: "lower",
  biceps: "upper",
  calves: "lower",
  cardio: "other",
  chest: "upper",
  forearms: "upper",
  full_body: "other",
  glutes: "lower",
  hamstrings: "lower",
  lats: "upper",
  lower_back: "lower",
  neck: "upper",
  other: "other",
  quadriceps: "lower",
  shoulders: "upper",
  traps: "upper",
  triceps: "upper",
  upper_back: "upper",
} as const satisfies Record<MuscleGroup, MuscleRegion>;

export const SET_FIELD_NAMES = [
  "weight",
  "reps",
  "duration",
  "distance",
  "floors",
  "steps",
] as const;
export type SetField = (typeof SET_FIELD_NAMES)[number];

/** The fields a set of each exercise type records. The workout session uses this map. */
export const SET_FIELDS = {
  weight_reps: ["weight", "reps"],
  reps_only: ["reps"],
  bodyweight_reps: ["reps"],
  bodyweight_assisted_reps: ["weight", "reps"],
  duration: ["duration"],
  distance_duration: ["distance", "duration"],
  short_distance_weight: ["weight", "distance"],
  floors_duration: ["floors", "duration"],
  steps_duration: ["steps", "duration"],
} as const satisfies Record<ExerciseType, readonly SetField[]>;

/** Field caps of an exercise. Postgres CHECKs, the zod schema and forms all use them. */
export const EXERCISE_TITLE_MAX = 100;
export const EXERCISE_INSTRUCTIONS_MAX = 2000;
/** Live (not archived) Custom exercises one account may hold. */
export const CUSTOM_EXERCISE_LIMIT = 1000;
