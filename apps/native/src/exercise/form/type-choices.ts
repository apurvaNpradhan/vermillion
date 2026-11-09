import { EXERCISE_TYPES, type ExerciseType } from "@workspace/shared";

/**
 * "How you log it": four plain choices that name what a set records, and "More" for the other
 * five exercise types. Written as literals so `pnpm i18n:report` sees every key as used.
 */
export const PLAIN_TYPE_CHOICES = [
  { type: "weight_reps", labelKey: "exercise__choice_weight_reps" },
  { type: "reps_only", labelKey: "exercise__choice_reps_only" },
  { type: "duration", labelKey: "exercise__choice_time" },
  { type: "distance_duration", labelKey: "exercise__choice_distance_time" },
] as const satisfies readonly { type: ExerciseType; labelKey: string }[];

type PlainType = (typeof PLAIN_TYPE_CHOICES)[number]["type"];

/** The exercise types "More" opens a list of: everything the plain choices do not cover. */
export const MORE_TYPES: readonly ExerciseType[] = EXERCISE_TYPES.filter(
  (type) => !PLAIN_TYPE_CHOICES.some((choice) => choice.type === type),
);

/** The choice a type belongs to: its own plain choice, or `more`. */
export type TypeChoice = PlainType | "more";

export function typeChoice(type: ExerciseType): TypeChoice {
  const plain = PLAIN_TYPE_CHOICES.find((choice) => choice.type === type);
  return plain ? plain.type : "more";
}
