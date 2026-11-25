import { SET_KIND_KEYS, type ExerciseType, type WeightUnit } from "@workspace/shared";
import { CaretDown, CaretUp } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";
import { useTranslation } from "@/platform/i18n";
import { EvidenceLines } from "@/platform/ui/evidence-lines";
import { progressionParams, progressionLabelKey } from "@/platform/ui/progression-reason";
import type { previewProgression } from "@/session";

type Preview = NonNullable<ReturnType<typeof previewProgression>>;

export function WorkoutProgressionPreview({
  exercises,
}: {
  exercises: readonly {
    id: string;
    title: string;
    preview: Preview;
    unit: WeightUnit;
    type: ExerciseType;
  }[];
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const subtle = useSubtleColor();
  if (exercises.length === 0) return null;
  const integer = new Intl.NumberFormat(i18n.language);
  const valueLabel = ({ weight, reps }: Preview["changes"][number]["last"], unitLabel: string) =>
    weight === null
      ? t("progress__target_reps", { count: reps })
      : t("progress__best", { weight, unit: unitLabel, reps: integer.format(reps) });

  return (
    <View className="rounded-xl bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        className="min-h-11 flex-row items-center justify-between gap-3 rounded-xl px-3.5 py-2 active:bg-default"
      >
        <Text className="flex-1 text-body font-medium text-foreground">
          {t("workout__progression_title")}
        </Text>
        <Text className="text-caption tabular-nums text-muted">
          {t("exercise__count", { count: exercises.length })}
        </Text>
        {expanded ? <CaretUp size={18} color={subtle} /> : <CaretDown size={18} color={subtle} />}
      </Pressable>
      {expanded ? (
        <View className="gap-3 px-3.5 pb-3.5">
          {exercises.map(({ id, title, unit, type, preview: { suggestion, changes } }) => {
            const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
            return (
              <View key={id} className="gap-2 border-t border-border pt-3">
                <View className="gap-0.5">
                  <Text className="text-body font-medium text-foreground">{title}</Text>
                  <EvidenceLines evidence={suggestion.evidence} type={type} unit={unit} />
                </View>
                {changes.map(({ kind, number, last, today, outcome }) => (
                  <View key={`${kind}-${number}`} className="gap-0.5">
                    <Text className="font-normal text-caption tabular-nums text-muted">
                      {kind === "working"
                        ? t("exercise__history_set", { number: integer.format(number) })
                        : t("workout__progression_set", {
                            kind: t(SET_KIND_KEYS[kind]),
                            number: integer.format(number),
                          })}
                    </Text>
                    <Text className="font-normal text-caption text-muted">
                      {t(
                        progressionLabelKey(outcome),
                        progressionParams(suggestion, outcome, unit),
                      )}
                    </Text>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                      <Text className="font-normal text-caption tabular-nums text-muted">
                        {t("workout__previous", { values: valueLabel(last, unitLabel) })}
                      </Text>
                      <Text className="text-caption font-semibold tabular-nums text-foreground">
                        {t("workout__progression_today", { values: valueLabel(today, unitLabel) })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
