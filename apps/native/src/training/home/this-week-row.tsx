import { KG_PER_LB, sessionGoal, type WeightUnit } from "@workspace/shared";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { StatTiles } from "@/platform/ui/stat-tiles";

import type { WeekTotals } from "./home-stats";

/**
 * "This week": sessions done against the goal, sets and volume, with the change on last week
 * under each once last week, up to the same point, has anything to compare.
 */
export function ThisWeekRow({
  current,
  previous,
  goal,
  unit,
}: {
  current: WeekTotals;
  previous: WeekTotals;
  goal: ReturnType<typeof sessionGoal>;
  unit: WeightUnit;
}) {
  const { t, i18n } = useTranslation();
  const format = useMemo(
    () => ({
      integer: new Intl.NumberFormat(i18n.language),
      decimal: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }),
      delta: new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
    }),
    [i18n.language],
  );
  // Tonnes for kilograms, pounds otherwise: the same units History used for its weekly volume.
  const volume = (kg: number) => (unit === "kg" ? kg / 1000 : kg / KG_PER_LB);
  // Last week up to this point; with nothing in it there is nothing fair to compare.
  const compare = previous.sessions > 0;
  // Just the signed change under each number; one caption below says what it is measured against,
  // so the three tiles stay on one row.
  const vs = (difference: number) => (compare ? format.delta.format(difference) : undefined);
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("home__this_week")}
      </Text>
      <StatTiles
        items={[
          {
            label: t("stats__sessions"),
            value:
              goal === null
                ? format.integer.format(current.sessions)
                : t("session__goal_ratio", {
                    done: format.integer.format(current.sessions),
                    goal: format.integer.format(goal),
                  }),
          },
          {
            label: t("stats__sets"),
            value: format.integer.format(current.sets),
            detail: vs(current.sets - previous.sets),
          },
          {
            label: t("stats__volume"),
            value: t("home__volume_value", {
              value: format.decimal.format(volume(current.volumeKg)),
              unit: unit === "kg" ? t("session__volume_tonnes") : t("training__unit_lb"),
            }),
            detail: compare
              ? t("home__volume_value", {
                  value: format.delta.format(volume(current.volumeKg) - volume(previous.volumeKg)),
                  unit: unit === "kg" ? t("session__volume_tonnes") : t("training__unit_lb"),
                })
              : undefined,
          },
        ]}
      />
      {compare ? (
        <Text className="font-normal text-caption text-muted">{t("home__this_week_compare")}</Text>
      ) : null}
    </View>
  );
}
