import type { TranslationKey } from "@workspace/i18n";
import { MUSCLE_GROUP_KEYS, derivedWorkoutTitle, type MuscleGroup } from "@workspace/shared";

/**
 * The title a Workout shows: its own, else the muscles it hits ("Chest · Shoulders · Triceps"),
 * else "Untitled workout" while it holds nothing.
 */
export function displayTitle(
  title: string | null,
  primaryMuscles: readonly MuscleGroup[],
  t: (key: TranslationKey) => string,
): string {
  if (title !== null) return title;
  const derived = derivedWorkoutTitle(primaryMuscles, (muscle) => t(MUSCLE_GROUP_KEYS[muscle]));
  return derived === "" ? t("training__untitled") : derived;
}
