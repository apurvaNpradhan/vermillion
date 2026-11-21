import { DEFAULT_WARMUP_STEPS, type WarmupStep } from "../logging/warmup-ramp";

/** How long someone has lifted: the one thing onboarding asks that sets progression defaults. */
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

const sameSteps = (a: readonly WarmupStep[], b: readonly WarmupStep[]) =>
  a.length === b.length &&
  a.every((step, index) => step.percent === b[index]?.percent && step.reps === b[index]?.reps);

/**
 * The preferences an experience answer sets. It only moves the warm-up ramp, and only while the
 * ramp is still one of the three presets: a ramp the person edited is theirs and stays. Programs
 * and the progression increment are never touched.
 */
export function experienceDefaults(
  experience: TrainingExperience,
  current: { warmupSteps: readonly WarmupStep[] },
): { trainingExperience: TrainingExperience; warmupSteps?: WarmupStep[] } {
  const untouched = TRAINING_EXPERIENCES.some((preset) =>
    sameSteps(current.warmupSteps, EXPERIENCE_WARMUP_STEPS[preset]),
  );
  return untouched
    ? {
        trainingExperience: experience,
        warmupSteps: EXPERIENCE_WARMUP_STEPS[experience].map((step) => ({ ...step })),
      }
    : { trainingExperience: experience };
}

/** Which of the two seeded kits a place gets: the full gym kit, or the smaller home kit. */
export function kitFor(place: TrainingPlace | null): "gym" | "home" {
  return place === null || place === "gym" ? "gym" : "home";
}
