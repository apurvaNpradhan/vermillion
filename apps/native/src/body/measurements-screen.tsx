import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  BODY_GROUPS,
  BODY_METRICS,
  changeSincePrevious,
  lastN,
  ratios,
  type BodyMetric,
  formatBodyValue,
} from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { Sparkline } from "@/platform/ui/charts/sparkline";
import { SyncBanner } from "@/sync";
import { useMeasurements } from "./use-measurements";
import { CheckInSheet } from "./check-in-sheet";
import { groupLabels, metricLabels } from "./metric-labels";
export function MeasurementsScreen() {
  const router = useRouter();
  const { reminder } = useLocalSearchParams<{ reminder?: string }>();
  const state = useMeasurements();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (reminder === "1") {
      setOpen(true);
      router.setParams({ reminder: undefined });
    }
  }, [reminder, router]);
  const latest: Partial<Record<BodyMetric, number>> = {};
  for (const metric of BODY_METRICS) {
    const row = lastN(state.forMetric(metric), 1)[0];
    if (row) latest[metric] = row.value;
  }
  const computed = ratios(latest, state.heightCm);
  const number = (value: number) => formatBodyValue(value, i18n.language);
  return (
    <ScrollPage back title={t("body__measurements")}>
      <SyncBanner />
      <Button isDisabled={state.loading || state.failed} onPress={() => setOpen(true)}>
        <Button.Label>{t("body__check_in")}</Button.Label>
      </Button>
      <Button variant="tertiary" onPress={() => router.push("/settings/tracked-metrics")}>
        <Button.Label>{t("body__tracked_metrics")}</Button.Label>
      </Button>
      {state.loading ? (
        <Text className="text-body text-muted">{t("common__loading")}</Text>
      ) : state.failed ? (
        <Button onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : (
        <>
          <View className="w-1/2 gap-2 border-b border-separator py-6">
            <Text className="text-body text-muted">{t("body__photo_slot")}</Text>
            <Text className="text-caption text-muted">{t("body__photo_later")}</Text>
          </View>
          {Object.entries(BODY_GROUPS).map(([group, metrics]) => {
            const tracked = metrics.filter((metric) => state.tracked.includes(metric));
            return tracked.length ? (
              <View key={group} className="gap-3">
                <Text
                  accessibilityRole="header"
                  className="text-title-md font-semibold text-foreground"
                >
                  {t(groupLabels[group === "upper" ? "upper" : group === "arms" ? "arms" : "legs"])}
                </Text>
                <View className="flex-row flex-wrap">
                  {tracked.map((metric) => {
                    const rows = state.forMetric(metric);
                    const last = lastN(rows, 1)[0];
                    const delta = changeSincePrevious(rows);
                    return (
                      <Pressable
                        key={metric}
                        accessibilityRole="button"
                        accessibilityLabel={t(metricLabels[metric])}
                        onPress={() =>
                          router.push({ pathname: "/body/metric/[metric]", params: { metric } })
                        }
                        className="w-1/2 gap-3 border-b border-separator p-3"
                      >
                        <Text className="text-label text-foreground">
                          {t(metricLabels[metric])}
                        </Text>
                        <Sparkline values={lastN(rows, 7).map((row) => row.value)} />
                        <Text className="text-numeric-md tabular-nums text-foreground">
                          {last
                            ? t("body__value", {
                                value: number(state.display(metric, last.value)),
                                unit: state.unit(metric),
                              })
                            : t("body__no_measurements")}
                        </Text>
                        {delta !== null ? (
                          <Text className="text-caption text-muted">
                            {t("body__metric_change", {
                              arrow: delta > 0 ? "↑" : delta < 0 ? "↓" : "→",
                              value: number(Math.abs(state.display(metric, delta))),
                              unit: state.unit(metric),
                            })}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null;
          })}
          {computed.waistToHeight !== null || computed.waistToHip !== null ? (
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-title-md font-semibold text-foreground"
              >
                {t("body__ratios")}
              </Text>
              <View className="flex-row">
                {(
                  [
                    {
                      label: "body__waist_to_height",
                      value: computed.waistToHeight,
                      history: state.ratioHistory.waistToHeight,
                    },
                    {
                      label: "body__waist_to_hip",
                      value: computed.waistToHip,
                      history: state.ratioHistory.waistToHip,
                    },
                  ] satisfies {
                    label: "body__waist_to_height" | "body__waist_to_hip";
                    value: number | null;
                    history: number[];
                  }[]
                ).map((item) =>
                  item.value === null ? null : (
                    <View key={item.label} className="w-1/2 gap-3 border-b border-separator p-3">
                      <Text className="text-label text-foreground">{t(item.label)}</Text>
                      <Sparkline values={item.history.slice(-7)} />
                      <Text className="text-numeric-md tabular-nums text-foreground">
                        {new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(
                          item.value,
                        )}
                      </Text>
                      {item.history.length > 1 ? (
                        <Text className="text-caption text-muted">
                          {t("body__ratio_change", {
                            arrow:
                              (item.history.at(-1) ?? 0) > (item.history.at(-2) ?? 0)
                                ? "↑"
                                : (item.history.at(-1) ?? 0) < (item.history.at(-2) ?? 0)
                                  ? "↓"
                                  : "→",
                            value: new Intl.NumberFormat(i18n.language, {
                              maximumFractionDigits: 3,
                            }).format(
                              Math.abs((item.history.at(-1) ?? 0) - (item.history.at(-2) ?? 0)),
                            ),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  ),
                )}
              </View>
            </View>
          ) : null}
        </>
      )}
      {open ? <CheckInSheet onClose={() => setOpen(false)} /> : null}
    </ScrollPage>
  );
}
