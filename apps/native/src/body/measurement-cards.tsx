import { WeighInGrid } from "./weigh-in-grid";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { changeSincePrevious, formatBodyValue } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useMeasurements } from "./use-measurements";
import { useWeight } from "./use-weight";
import { metricLabels } from "./metric-labels";
export function MeasurementsCard() {
  const state = useMeasurements();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const latest = state.entries.reduce<string | null>(
    (last, row) =>
      row.metric !== "weight" && (last === null || row.local_date > last) ? row.local_date : last,
    null,
  );
  const changes = state.tracked
    .flatMap((metric) => {
      const rows = state.forMetric(metric);
      const delta = changeSincePrevious(rows);
      return rows.at(-1)?.local_date === latest && delta !== null && delta !== 0
        ? [{ metric, delta }]
        : [];
    })
    .slice(0, 3);
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/body/measurements")}
        className="gap-3 active:opacity-70"
      >
        <Text className="text-title-md font-semibold text-foreground">
          {t("body__measurements")}
        </Text>
        <Text className="text-body text-muted">
          {state.loading
            ? t("common__loading")
            : latest
              ? t("body__latest_check_in", {
                  date: new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(new Date(latest)),
                })
              : t("body__no_measurements")}
        </Text>
        {changes.map(({ metric, delta }) => (
          <Text key={metric} className="text-caption text-muted">
            {t("body__home_change", {
              metric: t(metricLabels[metric]),
              arrow: delta > 0 ? "↑" : "↓",
              value: formatBodyValue(Math.abs(state.display(metric, delta)), i18n.language),
              unit: state.unit(metric),
            })}
          </Text>
        ))}
      </Pressable>
      {state.failed ? (
        <Button variant="tertiary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
export function WeighInHabitCard() {
  const state = useWeight();
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("body__habit")}
      onPress={() => router.push("/body/weight")}
      className="gap-3 rounded-2xl bg-surface p-4 active:opacity-70"
    >
      <Text className="text-title-md font-semibold text-foreground">{t("body__habit")}</Text>
      {state.loading ? (
        <Text className="text-body text-muted">{t("common__loading")}</Text>
      ) : state.failed ? (
        <Button variant="tertiary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : (
        <WeighInGrid days={state.days} />
      )}
    </Pressable>
  );
}
