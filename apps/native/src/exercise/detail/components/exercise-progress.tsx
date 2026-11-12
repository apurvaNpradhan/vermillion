import { useState } from "react";
import { Text, View } from "react-native";
import {
  bestProgressSet,
  oneRepMaxSeries,
  exerciseWeeklyVolume,
  formatWeight,
  type Equipment,
  type ExerciseType,
  type IncrementSettings,
  type ProgressRange,
  type SessionHistory,
} from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { LineChart, BarChart } from "@/platform/ui/charts/chart";
import { progressionReasonKey } from "@/platform/ui/progression-reason";
import { useExerciseProgression } from "../use-exercise-progression";

export function ExerciseProgress({
  sessions,
  exerciseId,
  type,
  equipment,
  settings,
  timezone,
  bodyweightKg,
}: {
  sessions: readonly SessionHistory[];
  exerciseId: string;
  type: ExerciseType;
  equipment: Equipment;
  settings: IncrementSettings;
  timezone: string | null;
  bodyweightKg: number | null;
}) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<ProgressRange>("3M");
  const now = Date.now();
  const best = bestProgressSet(sessions, exerciseId, "All", now);
  const unit = settings.weightUnit;
  const date = (x: number, zone: string | undefined) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: zone,
    }).format(new Date(x));
  const points = (data: { id: string; x: number; y: number }[], zone = timezone ?? undefined) =>
    data.map((point) => ({ ...point, label: date(point.x, zone) }));
  const weight = (value: number) =>
    t("progress__increment_value", { value: formatWeight(value, unit), unit });
  return (
    <View className="gap-4">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("progress__title")}
      </Text>
      {best ? (
        <View className="flex-row flex-wrap items-baseline justify-between gap-2">
          <Text className="text-title-lg font-semibold text-foreground">
            {t("progress__best", {
              weight: formatWeight(best.set.weight_kg ?? 0, unit),
              unit,
              reps: best.set.reps,
            })}
          </Text>
          <Text className="text-caption text-muted">
            {t("progress__one_rm", { value: formatWeight(best.oneRepMax, unit), unit })}
          </Text>
        </View>
      ) : null}
      <View className="flex-row gap-2">
        {(["3M", "1Y", "All"] satisfies ProgressRange[]).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={range === value ? "primary" : "tertiary"}
            accessibilityState={{ selected: range === value }}
            onPress={() => setRange(value)}
          >
            <Button.Label>
              {t(
                value === "3M"
                  ? "charts__three_months"
                  : value === "1Y"
                    ? "charts__one_year"
                    : "charts__all",
              )}
            </Button.Label>
          </Button>
        ))}
      </View>
      <LineChart
        showRanges={false}
        points={points(oneRepMaxSeries(sessions, exerciseId, range, now))}
        label={t("exercise__metric_one_rm")}
        formatValue={weight}
      />
      <BarChart
        showRanges={false}
        points={points(
          exerciseWeeklyVolume(
            sessions,
            exerciseId,
            range,
            now,
            // Weeks follow the device's zone until the account has one, as on Home.
            timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            bodyweightKg,
          ),
          "UTC",
        )}
        label={t("progress__weekly_volume")}
        formatValue={weight}
      />
      <NextTimeLine
        sessions={sessions}
        exerciseId={exerciseId}
        type={type}
        equipment={equipment}
        settings={settings}
      />
    </View>
  );
}

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
}: {
  sessions: readonly SessionHistory[];
  exerciseId: string;
  type: ExerciseType;
  equipment: Equipment;
  settings: IncrementSettings;
}) {
  const { t } = useTranslation();
  const { sets, suggestion } = useExerciseProgression(
    exerciseId,
    type,
    equipment,
    sessions,
    settings,
  );
  const firstIndex =
    sets?.findIndex((set) => set.kind === "working" && set.reps_min !== undefined) ?? -1;
  const target = sets?.[firstIndex];
  const next = suggestion?.sets[firstIndex];
  const unit = settings.weightUnit;
  if (!target || !next || !suggestion) return null;
  const aim =
    type === "weight_reps"
      ? next.weightKg === null
        ? null
        : t("progress__target", {
            weight: formatWeight(next.weightKg, unit),
            unit,
            min: target.reps_min,
            max: target.reps_max ?? target.reps_min,
          })
      : next.reps === null
        ? null
        : t("progress__target_reps", { count: next.reps });
  if (aim === null) return null;
  return (
    <View className="gap-2 border-t border-separator pt-3">
      <View className="flex-row justify-between gap-3">
        <Text className="text-body text-muted">{t("progress__next")}</Text>
        <Text className="text-body text-foreground">{aim}</Text>
      </View>
      <Text className="text-caption text-muted">
        {t(progressionReasonKey(suggestion.reason), {
          value: formatWeight(suggestion.incrementKg, unit),
          unit,
        })}
      </Text>
    </View>
  );
}
