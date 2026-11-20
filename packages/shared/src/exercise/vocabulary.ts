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
  "ez_bar",
  "trap_bar",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "smith_machine",
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
  "bodyweight_weighted_reps",
  "duration",
  "distance_duration",
  "short_distance_weight",
  "floors_duration",
  "steps_duration",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/**
 * Muscle details (ADR 0050): a finer part of one group, stored next to the groups. Detail slug to
 * its group; the order inside a group is the display order. A slug is `text` in Postgres.
 */
export const MUSCLE_DETAILS = {
  upper_chest: "chest",
  lower_chest: "chest",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  rotator_cuff: "shoulders",
  mid_traps: "upper_back",
  lower_traps: "upper_back",
  teres_major: "upper_back",
  biceps_brachii: "biceps",
  brachialis: "biceps",
  brachioradialis: "forearms",
  wrist_flexors: "forearms",
  wrist_extensors: "forearms",
  rectus_abdominis: "abdominals",
  obliques: "abdominals",
  deep_core: "abdominals",
  gastrocnemius: "calves",
  soleus: "calves",
  tibialis: "calves",
  glute_medius: "abductors",
  tfl: "abductors",
  hip_flexors: "quadriceps",
} as const satisfies Record<string, MuscleGroup>;
export type MuscleDetail = keyof typeof MUSCLE_DETAILS;

export const MUSCLE_DETAIL_SLUGS = [
  "upper_chest",
  "lower_chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "rotator_cuff",
  "mid_traps",
  "lower_traps",
  "teres_major",
  "biceps_brachii",
  "brachialis",
  "brachioradialis",
  "wrist_flexors",
  "wrist_extensors",
  "rectus_abdominis",
  "obliques",
  "deep_core",
  "gastrocnemius",
  "soleus",
  "tibialis",
  "glute_medius",
  "tfl",
  "hip_flexors",
] as const satisfies readonly MuscleDetail[];

const detailSlugSet: ReadonlySet<string> = new Set(MUSCLE_DETAIL_SLUGS);

/** True for a known detail slug; clients use it to drop slugs a later release adds. */
export function isMuscleDetail(value: string): value is MuscleDetail {
  return detailSlugSet.has(value);
}

/** The details of a group in display order (empty for groups without details). */
export function detailsOf(group: MuscleGroup): MuscleDetail[] {
  return MUSCLE_DETAIL_SLUGS.filter((detail) => MUSCLE_DETAILS[detail] === group);
}

/** The group a detail belongs to. */
export function groupOf(detail: MuscleDetail): MuscleGroup {
  return MUSCLE_DETAILS[detail];
}

/** Lowercase search aliases of each detail. English only, data not i18n (ADR 0050). */
export const MUSCLE_DETAIL_ALIASES = {
  upper_chest: ["upper chest", "clavicular pec", "incline chest"],
  lower_chest: ["lower chest", "sternal pec", "decline chest"],
  front_delts: ["front delt", "front delts", "anterior delt", "anterior deltoid"],
  side_delts: ["side delt", "side delts", "lateral delt", "lateral delts", "medial delt"],
  rear_delts: ["rear delt", "rear delts", "posterior delt", "rear deltoid"],
  rotator_cuff: ["rotator cuff", "infraspinatus", "supraspinatus", "teres minor", "subscapularis"],
  mid_traps: ["mid traps", "middle traps", "middle trapezius"],
  lower_traps: ["lower traps", "lower trapezius"],
  teres_major: ["teres major"],
  biceps_brachii: ["biceps brachii", "biceps", "long head", "short head"],
  brachialis: ["brachialis"],
  brachioradialis: ["brachioradialis"],
  wrist_flexors: ["wrist flexors", "forearm flexors"],
  wrist_extensors: ["wrist extensors", "forearm extensors"],
  rectus_abdominis: ["rectus abdominis", "abs", "six pack"],
  obliques: ["obliques", "side abs"],
  deep_core: ["deep core", "transverse abdominis", "transversus abdominis"],
  gastrocnemius: ["gastrocnemius", "gastroc", "standing calf"],
  soleus: ["soleus", "seated calf"],
  tibialis: ["tibialis", "tibialis anterior", "shin"],
  glute_medius: ["glute medius", "gluteus medius", "hip abductor"],
  tfl: ["tfl", "tensor fasciae latae"],
  hip_flexors: ["hip flexor", "hip flexors", "iliopsoas", "psoas"],
} as const satisfies Record<MuscleDetail, readonly string[]>;

type DetailRule = {
  primary_muscle: string;
  secondary_muscles: readonly string[];
  primary_detail: readonly string[];
  secondary_detail: readonly string[];
};

/**
 * Details are unique, primary details sit in the primary group, each secondary detail's group is
 * one of the secondary muscles, and no detail is in both lists. Unknown slugs fail the rule.
 */
export function hasValidDetails(value: DetailRule): boolean {
  const all = [...value.primary_detail, ...value.secondary_detail];
  if (new Set(all).size !== all.length) return false;
  for (const detail of value.primary_detail) {
    if (!isMuscleDetail(detail) || MUSCLE_DETAILS[detail] !== value.primary_muscle) return false;
  }
  for (const detail of value.secondary_detail) {
    if (!isMuscleDetail(detail) || !value.secondary_muscles.includes(MUSCLE_DETAILS[detail])) {
      return false;
    }
  }
  return true;
}

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
  bodyweight_weighted_reps: ["weight", "reps"],
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
