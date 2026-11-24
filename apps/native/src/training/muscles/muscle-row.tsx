import {
  MUSCLE_DETAIL_KEYS,
  MUSCLE_GROUP_KEYS,
  type DetailPart,
  type MuscleRow as Row,
} from "@workspace/shared";
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

/**
 * One muscle: its name, this week's sets against the weekly target ("8 / 12 sets"), an accent bar
 * with a tick where the target starts and a small dot for the average of the four weeks before
 * ("avg 10"). A row with detail parts lists them underneath (the muscle's share of each).
 */
export function MuscleRow({
  row,
  peak,
  average,
  parts = [],
  onPress,
}: {
  row: Row;
  peak: number;
  /** Sets a week over the four whole weeks before this one. */
  average: number;
  /** The muscle's sets by detail; shown as a second line when it has any. */
  parts?: readonly DetailPart[];
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { fill, bandStart, average: averageAt } = barLayout(row.sets, row.range, peak, average);
  const fillStyle = useFillStyle(fill);
  const name = t(MUSCLE_GROUP_KEYS[row.muscle]);
  const sets = formatSets(row.sets, i18n.language);
  const min = row.range ? formatSets(row.range.min, i18n.language) : "";
  const max = row.range ? formatSets(row.range.max, i18n.language) : "";
  const target = min === max ? min : `${min}–${max}`;
  const progress = `${sets} / ${target}`;
  const value =
    row.range === null
      ? t("muscles__row_volume", { sets })
      : t("muscles__row_progress", { sets, target });
  const averageText = formatSets(average, i18n.language);
  const breakdown = parts
    .map((part) =>
      t("muscles__part_value", {
        name:
          part.detail === "unspecified"
            ? t("muscles__part_unspecified")
            : t(MUSCLE_DETAIL_KEYS[part.detail]),
        sets: formatSets(part.sets, i18n.language),
      }),
    )
    .join(" · ");
  const label = [
    row.status === null
      ? t("muscles__row_volume_label", { muscle: name, sets })
      : t("muscles__row_progress_label", {
          muscle: name,
          value: progress,
          status: t(STATUS_KEYS[row.status]),
        }),
    average > 0 ? t("muscles__row_avg_label", { sets: averageText }) : null,
    breakdown === "" ? null : breakdown,
  ]
    .filter((part) => part !== null)
    .join(". ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("muscles__row_hint")}
      onPress={onPress}
      className="min-h-11 gap-2 rounded-xl px-3 py-2 active:bg-default"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="font-normal flex-1 text-body text-foreground">
          {name}
        </Text>
        <Text
          className={`font-normal text-body tabular-nums ${
            row.status === "above" ? "text-foreground" : "text-muted"
          }`}
        >
          {value}
        </Text>
      </View>
      <View className="h-2 rounded-full bg-default">
        <Animated.View className="h-2 rounded-full bg-chart" style={fillStyle} />
        {row.range === null ? null : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground"
            style={{ left: `${bandStart * 100}%` }}
          />
        )}
        {average > 0 ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="absolute top-3 -ml-[3px] size-1.5 rounded-full bg-muted"
            style={{ left: `${averageAt * 100}%` }}
          />
        ) : null}
      </View>
      {average > 0 || breakdown !== "" ? (
        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            numberOfLines={2}
            className="font-normal flex-1 text-caption tabular-nums text-muted"
          >
            {breakdown}
          </Text>
          {average > 0 ? (
            <Text className="font-normal text-caption tabular-nums text-muted">
              {t("muscles__row_avg", { sets: averageText })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
