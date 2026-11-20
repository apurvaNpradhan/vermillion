import { shownWeight, type weightChanges } from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

/** The windows the compact chips show, from the longer list the series computes. */
const SHOWN_DAYS = [7, 30, 90];

const DIRECTION_KEYS = {
  stable: "body__stable",
  increase: "body__increase",
  decrease: "body__decrease",
} as const;

/**
 * Three small tiles: how the trend moved over 7, 30 and 90 days. Neutral by design: a signed
 * number in `text-primary`, never a red or green judgement.
 */
export function WeightChanges({
  changes,
  unit,
}: {
  changes: ReturnType<typeof weightChanges>;
  unit: "kg" | "lb";
}) {
  const { t, i18n } = useTranslation();
  const signed = (kg: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    }).format(shownWeight(kg, unit));
  return (
    <View className="flex-row gap-3">
      {changes
        .filter((change) => SHOWN_DAYS.includes(change.days))
        .map((change) => {
          const value =
            change.change === null
              ? t("body__no_data")
              : t("body__value", { value: signed(change.change), unit });
          return (
            <View
              key={change.days}
              accessible
              accessibilityLabel={[
                t("body__days", { count: change.days }),
                value,
                change.direction === null ? null : t(DIRECTION_KEYS[change.direction]),
              ]
                .filter(Boolean)
                .join(", ")}
              className="min-h-16 flex-1 gap-0.5 rounded-xl bg-surface px-3 py-2"
            >
              <Text className="text-caption tabular-nums text-muted">
                {t("body__days", { count: change.days })}
              </Text>
              <Text numberOfLines={1} className="text-numeric-sm tabular-nums text-foreground">
                {value}
              </Text>
            </View>
          );
        })}
    </View>
  );
}
