import { MUSCLE_DETAIL_KEYS, MUSCLE_GROUP_KEYS, type MuscleShares } from "@workspace/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
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

/**
 * The share of sets per muscle as a horizontal bar list, biggest first, each with its percentage.
 * The full version offers a Muscles / Details switch (Details only when the period names any
 * detail); the compact one is the top five groups, for the report. The biggest bar takes the
 * accent and the rest are neutral greys by size, so no colour implies good or bad.
 */
export function MuscleDistribution({
  shares,
  compact = false,
}: {
  shares: MuscleShares;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
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
                className={`h-2 rounded-full ${row.fill.kind === "accent" ? "bg-accent" : "bg-foreground"}`}
                style={{
                  width: `${top > 0 ? (row.share / top) * 100 : 0}%`,
                  opacity: row.fill.kind === "neutral" ? row.fill.opacity : 1,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
