import { MUSCLE_GROUP_KEYS, type MuscleRow as Row } from "@workspace/shared";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useFillStyle } from "@/platform/ui/use-fill";

import { barLayout, formatSets } from "./muscle-bars";

const STATUS_KEYS = {
  below: "muscles__status_below",
  on_target: "muscles__status_on_target",
  above: "muscles__status_above",
} as const;

/** One muscle: its name, "9 of 10–20", an accent bar for its sets and a tick where its target starts. */
export function MuscleRow({ row, peak, onPress }: { row: Row; peak: number; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { fill, bandStart } = barLayout(row.sets, row.range, peak);
  const fillStyle = useFillStyle(fill);
  const name = t(MUSCLE_GROUP_KEYS[row.muscle]);
  const sets = formatSets(row.sets, i18n.language);
  const min = row.range ? formatSets(row.range.min, i18n.language) : "";
  const max = row.range ? formatSets(row.range.max, i18n.language) : "";
  const value =
    row.range === null
      ? t("muscles__row_volume", { sets })
      : min === max
        ? t("muscles__row_count_target", { sets, target: min })
        : t("muscles__row_value", { sets, min, max });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        row.status === null
          ? t("muscles__row_volume_label", { muscle: name, sets })
          : t("muscles__row_progress_label", {
              muscle: name,
              value,
              status: t(STATUS_KEYS[row.status]),
            })
      }
      accessibilityHint={t("muscles__goal_hint")}
      onPress={onPress}
      className="min-h-11 gap-2 rounded-xl px-3 py-2 active:bg-default"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="flex-1 text-body text-foreground">
          {name}
        </Text>
        <Text
          className={`text-body tabular-nums ${
            row.status === "above" ? "text-warning" : "text-muted"
          }`}
        >
          {value}
        </Text>
      </View>
      <View className="h-2 rounded-full bg-default">
        <Animated.View className="h-2 rounded-full bg-identity" style={fillStyle} />
        {row.range === null ? null : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground"
            style={{ left: `${bandStart * 100}%` }}
          />
        )}
      </View>
    </Pressable>
  );
}
