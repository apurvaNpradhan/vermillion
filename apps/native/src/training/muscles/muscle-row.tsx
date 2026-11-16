import { MUSCLE_GROUP_KEYS, type MuscleRow as Row } from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { barLayout, formatSets } from "./muscle-bars";

const STATUS_KEYS = {
  below: "muscles__status_below",
  on_target: "muscles__status_on_target",
  above: "muscles__status_above",
} as const;

/** One muscle: its name, "9 of 10–20", and a bar with the range as a quiet band behind it. */
export function MuscleRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { fill, bandStart, bandEnd } = barLayout(row.sets, row.range);
  const name = t(MUSCLE_GROUP_KEYS[row.muscle]);
  const sets = formatSets(row.sets, i18n.language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("muscles__row_label", {
        muscle: name,
        sets,
        min: row.range.min,
        max: row.range.max,
        status: t(STATUS_KEYS[row.status]),
      })}
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
          {t("muscles__row_value", { sets, min: row.range.min, max: row.range.max })}
        </Text>
      </View>
      <View className="h-2 rounded-full bg-default">
        <View
          className="absolute inset-y-0 rounded-full bg-foreground/15"
          style={{ left: `${bandStart * 100}%`, width: `${(bandEnd - bandStart) * 100}%` }}
        />
        <View
          className={`h-2 rounded-full ${
            row.status === "on_target" ? "bg-success" : "bg-foreground/50"
          }`}
          style={{ width: `${fill * 100}%` }}
        />
      </View>
    </Pressable>
  );
}
