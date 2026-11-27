import { Text, View } from "react-native";
import { addsLoad, formatLoad, type ExerciseType } from "@workspace/shared";
import { displayTitle } from "@/platform/training/derived-title";
import { useTranslation } from "@/platform/i18n";
import { progressionLabelKey, progressionParams } from "@/platform/ui/progression-reason";
import { useExerciseProgression } from "../use-exercise-progression";

/** The first suggested working set for the Workout the user is likely to train next. */
export function NextTimeLine({
  exerciseId,
  type,
  gymId,
}: {
  exerciseId: string;
  type: ExerciseType;
  gymId?: string | null;
}) {
  const { t } = useTranslation();
  const result = useExerciseProgression(exerciseId, gymId);
  if (!result) return null;
  const { sets, suggestion, unit, workout } = result;
  const title = displayTitle(
    workout.title,
    workout.exercises.flatMap(({ exercise }) => (exercise ? [exercise.primaryMuscle] : [])),
    (key) => t(key),
  );
  const firstIndex = sets.findIndex((set, index) => {
    const aimed = suggestion?.sets[index];
    return (
      set.kind === "working" &&
      (aimed?.reps != null || aimed?.durationS != null || aimed?.distanceM != null)
    );
  });
  const next = suggestion?.sets[firstIndex];
  const outcome = suggestion?.outcomes[firstIndex];
  if (!next || !suggestion || !outcome) return null;
  const loaded = (type === "weight_reps" || addsLoad(type)) && next.weightKg !== null;
  const aim =
    next.durationS != null
      ? t("progress__target_seconds", { count: next.durationS })
      : next.distanceM != null
        ? next.weightKg !== null && next.weightKg > 0
          ? t("progress__target_carry", {
              weight: formatLoad(next.weightKg, unit, type),
              unit,
              metres: next.distanceM,
            })
          : t("progress__target_metres", { count: next.distanceM })
        : next.reps === null
          ? null
          : loaded
            ? t("progress__best", {
                weight: formatLoad(next.weightKg ?? 0, unit, type),
                unit,
                reps: next.reps,
              })
            : t("progress__target_reps", { count: next.reps });
  if (aim === null) return null;
  return (
    <View className="gap-2 pt-3">
      <View className="flex-row justify-between gap-3">
        <Text className="font-normal text-body text-muted">
          {t("progress__next_workout", { workout: title })}
        </Text>
        <Text className="font-normal text-body text-foreground">{aim}</Text>
      </View>
      <Text className="font-normal text-caption text-muted">
        {t(progressionLabelKey(outcome), progressionParams(suggestion, outcome, unit))}
      </Text>
    </View>
  );
}
