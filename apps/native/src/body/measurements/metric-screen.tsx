import { useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { Trash } from "phosphor-react-native";
import { type BodyMetric, formatBodyValue } from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { LineChart } from "@/platform/ui/charts/chart";
import { SwipeRow } from "@/platform/ui/swipe-row";
import { BodyState } from "@/body/body-state";
import { useMeasurements } from "./use-measurements";
import { useMeasurementActions } from "./use-measurement-actions";
import { CheckInSheet } from "./check-in-sheet";
import { metricLabels } from "./metric-labels";
const ranges = [
  { key: "body__one_week", days: 7 },
  { key: "body__one_month", days: 30 },
  { key: "body__three_months", days: 90 },
  { key: "body__six_months", days: 180 },
  { key: "body__one_year", days: 365 },
  { key: "charts__all", days: Infinity },
] as const; // Safety: fixed translation keys.
export function MetricScreen({ metric }: { metric: BodyMetric }) {
  const state = useMeasurements();
  const actions = useMeasurementActions();
  const { t, i18n } = useTranslation();
  const [logging, setLogging] = useState(false);
  const [range, setRange] = useState(1);
  const [entry, setEntry] = useState<WatchedMeasurement>();
  const [limit, setLimit] = useState(50);
  const rows = state.forMetric(metric);
  const start = Date.parse(state.today) - (ranges[range]?.days ?? 30) * 86400000;
  const format = (value: number) =>
    t("body__value", {
      value: formatBodyValue(state.display(metric, value), i18n.language),
      unit: state.unit(metric),
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(value),
    );
  return (
    <ScrollPage back title={t(metricLabels[metric])}>
      <Button isDisabled={state.loading || state.failed} onPress={() => setLogging(true)}>
        <Button.Label>{t("body__log")}</Button.Label>
      </Button>
      {state.loading || state.failed ? (
        <BodyState loading={state.loading} failed={state.failed} retry={state.retry} />
      ) : (
        <>
          <ScrollView horizontal contentContainerClassName="gap-2">
            {ranges.map((item, index) => (
              <Button
                key={item.key}
                size="sm"
                variant={range === index ? "primary" : "tertiary"}
                accessibilityState={{ selected: range === index }}
                onPress={() => setRange(index)}
              >
                <Button.Label>{t(item.key)}</Button.Label>
              </Button>
            ))}
          </ScrollView>
          <LineChart
            domain="data"
            showRanges={false}
            label={t(metricLabels[metric])}
            formatValue={format}
            points={rows.flatMap((row) =>
              Date.parse(row.local_date) >= start
                ? [
                    {
                      id: row.id,
                      x: Date.parse(row.measured_at),
                      y: row.value,
                      label: date(row.local_date),
                    },
                  ]
                : [],
            )}
          />
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("body__entries")}
          </Text>
          {!rows.length ? <BodyState empty={t("body__no_measurements")} /> : null}
          {rows
            .slice(-limit)
            .reverse()
            .map((row) => (
              <SwipeRow
                key={row.id}
                actions={[
                  {
                    key: "delete",
                    label: t("body__delete"),
                    icon: Trash,
                    tone: "danger",
                    onPress: () => void actions.remove(row),
                  },
                ]}
              >
                {(a11y) => (
                  <Pressable
                    {...a11y}
                    accessibilityRole="button"
                    accessibilityLabel={t("body__edit_entry", {
                      date: date(row.local_date),
                      value: format(row.value),
                    })}
                    onPress={() => setEntry(row)}
                    className="flex-row justify-between gap-4 rounded-xl py-4 active:bg-default"
                  >
                    <Text className="font-normal text-body tabular-nums text-muted">
                      {date(row.local_date)}
                    </Text>
                    <Text className="font-normal text-body tabular-nums text-foreground">
                      {format(row.value)}
                    </Text>
                  </Pressable>
                )}
              </SwipeRow>
            ))}
          {rows.length > limit ? (
            <Button variant="tertiary" onPress={() => setLimit(limit + 50)}>
              <Button.Label>{t("body__more_entries")}</Button.Label>
            </Button>
          ) : null}
        </>
      )}
      {logging ? <CheckInSheet onlyMetric={metric} onClose={() => setLogging(false)} /> : null}
      {entry ? <CheckInSheet entry={entry} onClose={() => setEntry(undefined)} /> : null}
    </ScrollPage>
  );
}
