import type { Equipment, ExerciseType, MuscleGroup, MuscleRegion } from "./vocabulary";

// Written out as literals so `pnpm i18n:report` sees every key as used.

/** i18n key of each muscle group's name. */
export const MUSCLE_GROUP_KEYS = {
  abdominals: "exercise__muscle_abdominals",
  abductors: "exercise__muscle_abductors",
  adductors: "exercise__muscle_adductors",
  biceps: "exercise__muscle_biceps",
  calves: "exercise__muscle_calves",
  cardio: "exercise__muscle_cardio",
  chest: "exercise__muscle_chest",
  forearms: "exercise__muscle_forearms",
  full_body: "exercise__muscle_full_body",
  glutes: "exercise__muscle_glutes",
  hamstrings: "exercise__muscle_hamstrings",
  lats: "exercise__muscle_lats",
  lower_back: "exercise__muscle_lower_back",
  neck: "exercise__muscle_neck",
  other: "exercise__muscle_other",
  quadriceps: "exercise__muscle_quadriceps",
  shoulders: "exercise__muscle_shoulders",
  traps: "exercise__muscle_traps",
  triceps: "exercise__muscle_triceps",
  upper_back: "exercise__muscle_upper_back",
} as const satisfies Record<MuscleGroup, string>;

export const EQUIPMENT_KEYS = {
  none: "exercise__equipment_none",
  barbell: "exercise__equipment_barbell",
  dumbbell: "exercise__equipment_dumbbell",
  kettlebell: "exercise__equipment_kettlebell",
  machine: "exercise__equipment_machine",
  plate: "exercise__equipment_plate",
  resistance_band: "exercise__equipment_resistance_band",
  suspension: "exercise__equipment_suspension",
  other: "exercise__equipment_other",
} as const satisfies Record<Equipment, string>;

export const EXERCISE_TYPE_KEYS = {
  weight_reps: "exercise__type_weight_reps",
  reps_only: "exercise__type_reps_only",
  bodyweight_reps: "exercise__type_bodyweight_reps",
  bodyweight_assisted_reps: "exercise__type_bodyweight_assisted_reps",
  duration: "exercise__type_duration",
  distance_duration: "exercise__type_distance_duration",
  short_distance_weight: "exercise__type_short_distance_weight",
  floors_duration: "exercise__type_floors_duration",
  steps_duration: "exercise__type_steps_duration",
} as const satisfies Record<ExerciseType, string>;

export const MUSCLE_REGION_KEYS = {
  upper: "exercise__region_upper",
  lower: "exercise__region_lower",
  other: "exercise__region_other",
} as const satisfies Record<MuscleRegion, string>;
