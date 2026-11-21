import { formatWeight, SET_KIND_KEYS, type WeightUnit } from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { breakWeeks, progressionLabelKey } from "@/platform/ui/progression-reason";
import type { previewProgression } from "@/session";

type Preview = NonNullable<ReturnType<typeof previewProgression>>;

export function WorkoutProgressionPreview({
  exercises,
  unit,
  unitLabel,
}: {
  exercises: readonly { id: string; title: string; preview: Preview }[];
  unit: WeightUnit;
  unitLabel: string;
}) {
  const { t, i18n } = useTranslation();
  if (exercises.length === 0) return null;
  const integer = new Intl.NumberFormat(i18n.language);
  const valueLabel = ({ weight, reps }: Preview["changes"][number]["last"]) =>
    weight === null
      ? t("progress__target_reps", { count: reps })
      : t("progress__best", { weight, unit: unitLabel, reps: integer.format(reps) });

  return (
    <View className="gap-3 rounded-xl bg-surface p-3.5">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("workout__progression_title")}
      </Text>
      {exercises.map(({ id, title, preview: { suggestion, changes } }) => (
        <View key={id} className="gap-2 border-t border-border pt-3">
          <View className="gap-0.5">
            <Text className="text-body font-medium text-foreground">{title}</Text>
            <Text className="font-normal text-caption text-muted">
              {t(progressionLabelKey(suggestion.reason), {
                value: formatWeight(suggestion.incrementKg, unit),
                unit: unitLabel,
                count: breakWeeks(suggestion),
              })}
            </Text>
          </View>
          {changes.map(({ kind, number, last, today }) => (
            <View key={`${kind}-${number}`} className="gap-0.5">
              <Text className="font-normal text-caption tabular-nums text-muted">
                {kind === "working"
                  ? t("exercise__history_set", { number: integer.format(number) })
                  : t("workout__progression_set", {
                      kind: t(SET_KIND_KEYS[kind]),
                      number: integer.format(number),
                    })}
              </Text>
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <Text className="font-normal text-caption tabular-nums text-muted">
                  {t("workout__previous", { values: valueLabel(last) })}
                </Text>
                <Text className="text-caption font-semibold tabular-nums text-foreground">
                  {t("workout__progression_today", { values: valueLabel(today) })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
