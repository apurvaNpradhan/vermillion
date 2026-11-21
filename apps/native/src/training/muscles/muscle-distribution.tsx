import { MUSCLE_DETAIL_KEYS, MUSCLE_GROUP_KEYS, type MuscleShares } from "@workspace/shared";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { useState } from "react";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { useTranslation } from "@/platform/i18n";
import { isColorString, useAppliedVariant } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

import {
  detailRows,
  formatPercent,
  groupRows,
  hasDetails,
  type ShareRow,
} from "./muscle-share-rows";

/** How many bars the compact version keeps. */
const COMPACT_LIMIT = 5;

/** The five theme chart colours; the role tokens stand in until the CSS variables resolve. */
function useChartTones() {
  const roles = nativeColors[useAppliedVariant()];
  const [one, two, three, four, five] = useCSSVariable([
    "--color-chart-1",
    "--color-chart-2",
    "--color-chart-3",
    "--color-chart-4",
    "--color-chart-5",
  ]);
  const pick = (value: typeof one, fallback: string) => (isColorString(value) ? value : fallback);
  return {
    1: pick(one, roles["chart-1"]),
    2: pick(two, roles["chart-2"]),
    3: pick(three, roles["chart-3"]),
    4: pick(four, roles["chart-4"]),
    5: pick(five, roles["chart-5"]),
  } as const;
}

/**
 * The share of sets per muscle as a horizontal bar list, biggest first, each with its percentage.
 * The full version offers a Muscles / Details switch (Details only when the period names any
 * detail); the compact one is the top five groups, for the report. A group keeps one chart
 * colour, and its details wear it too.
 */
export function MuscleDistribution({
  shares,
  compact = false,
}: {
  shares: MuscleShares;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tones = useChartTones();
  const [mode, setMode] = useState<"groups" | "details">("groups");
  const detailed = !compact && mode === "details" && hasDetails(shares);
  const rows = detailed
    ? detailRows(shares)
    : groupRows(shares, compact ? COMPACT_LIMIT : undefined);
  const top = Math.max(...rows.map((row) => row.share), 0);
  const name = (row: ShareRow) =>
    t(row.detail === null ? MUSCLE_GROUP_KEYS[row.muscle] : MUSCLE_DETAIL_KEYS[row.detail]);
  if (rows.length === 0) {
    return (
      <Text className="font-normal text-body text-muted">{t("muscles__distribution_empty")}</Text>
    );
  }
  return (
    <View className="gap-3">
      {!compact && hasDetails(shares) ? (
        <View className="flex-row gap-2">
          {(["groups", "details"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "primary" : "tertiary"}
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
            >
              <Button.Label>
                {t(
                  value === "groups"
                    ? "muscles__distribution_groups"
                    : "muscles__distribution_details",
                )}
              </Button.Label>
            </Button>
          ))}
        </View>
      ) : null}
      {rows.map((row) => {
        const percent = formatPercent(row.percent, i18n.language);
        return (
          <View
            key={row.key}
            accessible
            accessibilityLabel={t("muscles__distribution_row", { muscle: name(row), percent })}
            className="gap-1.5"
          >
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="font-normal flex-1 text-body text-foreground" numberOfLines={1}>
                {name(row)}
                {detailed ? (
                  <Text className="text-caption text-muted">
                    {" · "}
                    {t(MUSCLE_GROUP_KEYS[row.muscle])}
                  </Text>
                ) : null}
              </Text>
              <Text
                className="font-normal text-body text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {percent}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-default">
              <View
                className="h-2 rounded-full"
                style={{
                  width: `${top > 0 ? (row.share / top) * 100 : 0}%`,
                  backgroundColor: tones[row.tone],
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
