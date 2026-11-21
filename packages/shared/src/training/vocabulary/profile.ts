import { DEFAULT_WARMUP_STEPS, type WarmupStep } from "../logging/warmup-ramp";

/** How long someone has lifted: used to choose a starting warm-up ramp. */
export const TRAINING_EXPERIENCES = ["new", "some", "experienced"] as const;
export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];

/** Where someone trains; it only picks the default bars and plates. */
export const TRAINING_PLACES = ["gym", "home_barbell", "dumbbells", "bodyweight"] as const;
export type TrainingPlace = (typeof TRAINING_PLACES)[number];

export const TRAINING_EXPERIENCE_KEYS = {
  new: "profile__experience_new",
  some: "profile__experience_some",
  experienced: "profile__experience_experienced",
} as const satisfies Record<TrainingExperience, string>;

export const TRAINING_EXPERIENCE_HINT_KEYS = {
  new: "profile__experience_new_hint",
  some: "profile__experience_some_hint",
  experienced: "profile__experience_experienced_hint",
} as const satisfies Record<TrainingExperience, string>;

export const TRAINING_PLACE_KEYS = {
  gym: "profile__place_gym",
  home_barbell: "profile__place_home_barbell",
  dumbbells: "profile__place_dumbbells",
  bodyweight: "profile__place_bodyweight",
} as const satisfies Record<TrainingPlace, string>;

/**
 * The warm-up ramp each experience starts with. Someone new warms up with two lighter sets (fewer
 * sets before the first working set, nothing near a heavy single); someone who has lifted for
 * about six months to two years gets the app's own default ramp; an experienced lifter gets four
 * steps that climb closer to the working weight.
 */
export const EXPERIENCE_WARMUP_STEPS = {
  new: [
    { percent: 60, reps: 5 },
    { percent: 80, reps: 2 },
  ],
  some: DEFAULT_WARMUP_STEPS,
  experienced: [
    { percent: 50, reps: 5 },
    { percent: 65, reps: 3 },
    { percent: 80, reps: 2 },
    { percent: 90, reps: 1 },
  ],
} as const satisfies Record<TrainingExperience, readonly WarmupStep[]>;

/** Picks a new ramp only while the current steps still match a preset. */
export function experienceWarmupSteps(
  experience: TrainingExperience,
  current: readonly WarmupStep[],
): WarmupStep[] | undefined {
  // Ramps are applied in ascending percentage, regardless of how the editor stored them.
  const isPreset = Object.values(EXPERIENCE_WARMUP_STEPS).some(
    (steps) =>
      current.length === steps.length &&
      steps.every((preset) =>
        current.some((step) => step.percent === preset.percent && step.reps === preset.reps),
      ),
  );
  if (isPreset) return EXPERIENCE_WARMUP_STEPS[experience].map((step) => ({ ...step }));
}
