import { Text, View } from "react-native";
import {
  addsLoad,
  formatLoad,
  formatWeight,
  type Equipment,
  type ExerciseType,
  type IncrementSettings,
  type SessionHistory,
} from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { breakWeeks, progressionLabelKey } from "@/platform/ui/progression-reason";
import { useExerciseProgression } from "../use-exercise-progression";

/**
 * What to aim for next time on the first ranged working set, and why. Weighted exercises show a
 * weight and the rep range; reps-only ones show the reps.
 */
export function NextTimeLine({
  sessions,
  exerciseId,
  type,
  equipment,
  settings,
  gymId,
}: {
  sessions: readonly SessionHistory[];
  exerciseId: string;
  type: ExerciseType;
  equipment: Equipment;
  settings: IncrementSettings;
  gymId?: string | null;
}) {
  const { t } = useTranslation();
  const { sets, suggestion } = useExerciseProgression(
    exerciseId,
    type,
    equipment,
    sessions,
    settings,
    gymId,
  );
  const firstIndex =
    sets?.findIndex((set) => set.kind === "working" && set.reps_min !== undefined) ?? -1;
  const target = sets?.[firstIndex];
  const next = suggestion?.sets[firstIndex];
  const unit = settings.weightUnit;
  if (!target || !next || !suggestion) return null;
  const aim =
    type === "weight_reps" || addsLoad(type)
      ? next.weightKg === null
        ? null
        : t("progress__target", {
            weight: formatLoad(next.weightKg, unit, type),
            unit,
            min: target.reps_min,
            max: target.reps_max ?? target.reps_min,
          })
      : next.reps === null
        ? null
        : t("progress__target_reps", { count: next.reps });
  if (aim === null) return null;
  return (
    <View className="gap-2 pt-3">
      <View className="flex-row justify-between gap-3">
        <Text className="font-normal text-body text-muted">{t("progress__next")}</Text>
        <Text className="font-normal text-body text-foreground">{aim}</Text>
      </View>
      <Text className="font-normal text-caption text-muted">
        {t(progressionLabelKey(suggestion.reason), {
          value: formatWeight(suggestion.incrementKg, unit),
          unit,
          count: breakWeeks(suggestion),
        })}
      </Text>
    </View>
  );
}
