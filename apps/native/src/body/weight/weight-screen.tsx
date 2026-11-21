import { useLocalSearchParams, useRouter } from "expo-router";
import { SyncBanner } from "@/sync";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Info, Trash } from "phosphor-react-native";
import { useThemeColor, BottomSheet } from "heroui-native";
import { formatBodyWeight, weeklyPoints, changeOver, type TrendPoint } from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { LineChart } from "@/platform/ui/charts/chart";
import { PINNED_ACTION_SPACE, PinnedAction } from "@/platform/ui/pinned-action";
import { SwipeRow } from "@/platform/ui/swipe-row";
import { usePreferences } from "@/preferences";
import { BodyState } from "@/body/body-state";
import { useWeight } from "./use-weight";
import { useLogWeight } from "./use-log-weight";
import { WeighInHeatmap } from "./weigh-in-heatmap";
import { daysSince, trendIsStale } from "./weigh-in-days";
import { WeightChanges } from "./weight-changes";
import { WeightLogSheet } from "./weight-log-sheet";
const ranges = [
  { label: "body__one_week", days: 7 },
  { label: "body__one_month", days: 30 },
  { label: "body__three_months", days: 90 },
  { label: "body__six_months", days: 180 },
  { label: "body__one_year", days: 365 },
  { label: "charts__all", days: Infinity },
] as const; // Safety: fixed range labels are i18n keys.
export function WeightScreen() {
  const router = useRouter();
  const { reminder } = useLocalSearchParams<{ reminder?: string }>();
  const state = useWeight();
  const actions = useLogWeight();
  const { t, i18n } = useTranslation();
  const { preferences, setUiAsync } = usePreferences();
  const [range, setRange] = useState(1);
  const [logging, setLogging] = useState(false);
  useEffect(() => {
    if (reminder === "1" && !state.loading && !state.failed) {
      setLogging(true);
      router.setParams({ reminder: undefined });
    }
  }, [reminder, router, state.loading, state.failed]);
  const [entry, setEntry] = useState<WatchedMeasurement>();
  const [info, setInfo] = useState(false);
  const [goal, setGoal] = useState(false);
  const ink = useThemeColor("foreground");
  const days = ranges[range]?.days ?? 30;
  const start = Date.parse(state.today) - days * 86400000;
  const selected = state.series.filter((p) => Date.parse(p.date) >= start);
  const series = days >= 365 ? weeklyPoints(selected, preferences.ui.weekStart) : selected;
  const format = (value: number) =>
    t("body__value", { value: formatBodyWeight(value, state.unit), unit: state.unit });
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(value),
    );
  const points = (rows: readonly TrendPoint[]) =>
    rows.map((p) => ({ id: p.date, x: Date.parse(p.date), y: p.trend, label: date(p.date) }));
  const delta = changeOver(selected, Math.max(0, selected.length - 1));
  const change = delta === null ? null : format(delta);
  const rate = state.rate === null ? null : format(state.rate);
  const empty = state.loading || state.failed || !state.entries.length;
  const lastWeighIn = state.lastMeasurementDate;
  const stale = trendIsStale(lastWeighIn, state.today);

  return (
    <View className="flex-1">
      <ScrollPage title={t("body__title")}>
        <SyncBanner />
        {empty ? (
          <>
            <BodyState
              loading={state.loading}
              failed={state.failed}
              retry={state.retry}
              empty={t("body__empty")}
            />
            <Button
              variant="tertiary"
              isDisabled={state.loading || state.failed}
              onPress={() => setGoal(true)}
            >
              <Button.Label>{t("body__goal")}</Button.Label>
            </Button>
          </>
        ) : (
          <View className="gap-6">
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="font-normal text-caption text-muted">{t("body__trend_now")}</Text>
                <View className="flex-row items-center gap-2">
                  <Button
                    isIconOnly
                    variant="ghost"
                    accessibilityLabel={t("body__info")}
                    onPress={() => setInfo(true)}
                  >
                    <Info size={24} weight="regular" color={ink} />
                  </Button>
                  <Button variant="tertiary" size="sm" onPress={() => setGoal(true)}>
                    <Button.Label>{t("body__goal")}</Button.Label>
                  </Button>
                </View>
              </View>
              <Text
                className="font-normal text-numeric-xl text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {state.trend === null ? t("body__empty") : format(state.trend)}
              </Text>
              {change !== null || rate !== null ? (
                <Text className="font-normal text-body text-muted">
                  {change !== null && rate !== null
                    ? t("body__headline_change", { change, rate })
                    : change !== null
                      ? t("body__headline_change_only", { change })
                      : t("body__headline_rate_only", { rate })}
                </Text>
              ) : null}
              {stale && lastWeighIn !== null ? (
                <Text className="font-normal text-caption text-muted">
                  {t("body__last_weigh_in", {
                    date: date(lastWeighIn),
                    count: daysSince(lastWeighIn, state.today),
                  })}
                </Text>
              ) : selected[0] ? (
                <Text className="font-normal text-caption text-muted">
                  {t("body__date_range", {
                    from: date(selected[0].date),
                    to: date(selected.at(-1)?.date ?? state.today),
                  })}
                </Text>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {ranges.map((item, i) => (
                <Button
                  key={item.label}
                  size="sm"
                  variant={i === range ? "secondary" : "tertiary"}
                  accessibilityState={{ selected: i === range }}
                  onPress={() => setRange(i)}
                >
                  <Button.Label>{t(item.label)}</Button.Label>
                </Button>
              ))}
            </ScrollView>
            <LineChart
              domain="data"
              showRanges={false}
              points={points(series)}
              secondaryPoints={series.flatMap((p) =>
                p.scale === null
                  ? []
                  : [{ id: p.date, x: Date.parse(p.date), y: p.scale, label: date(p.date) }],
              )}
              goal={state.goal}
              hideDots={new Set(series.flatMap((p) => (p.interpolated ? [p.date] : [])))}
              label={t("body__trend")}
              formatValue={format}
              readout={(point) => {
                const p = series.find((p) => p.date === point.id);
                return t("body__scrub", {
                  date: point.label,
                  trend: format(point.y),
                  scale: p?.scale == null ? t("body__no_weigh_in") : format(p.scale),
                });
              }}
            />
            <WeightChanges changes={state.changes} unit={state.unit} />
            <WeighInHeatmap
              entries={state.entries}
              today={state.today}
              weekStart={preferences.ui.weekStart}
            />
            <View className="gap-4">
              <Text
                accessibilityRole="header"
                className="text-title-md font-semibold text-foreground"
              >
                {t("body__entries")}
              </Text>
              {state.months.map(([month, entries]) => (
                <View key={month} className="gap-2">
                  <Text className="font-normal text-caption text-muted">
                    {new Intl.DateTimeFormat(i18n.language, {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${month}-01`))}
                  </Text>
                  {entries.map((row) => (
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
                          onPress={() => {
                            setEntry(row);
                            setLogging(true);
                          }}
                          className="flex-row justify-between rounded-xl py-4 active:bg-default"
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
                </View>
              ))}
            </View>
          </View>
        )}
        {state.hasMoreEntries ? (
          <Button variant="tertiary" onPress={state.loadMoreEntries}>
            <Button.Label>{t("body__more_entries")}</Button.Label>
          </Button>
        ) : null}
        <View style={{ height: PINNED_ACTION_SPACE }} />
      </ScrollPage>
      <PinnedAction>
        <Button
          isDisabled={state.loading || state.failed}
          onPress={() => {
            setEntry(undefined);
            setLogging(true);
          }}
        >
          <Button.Label>{t("body__log")}</Button.Label>
        </Button>
      </PinnedAction>
      {logging ? <WeightLogSheet entry={entry} onClose={() => setLogging(false)} /> : null}
      {goal ? (
        <WeightLogSheet
          goal
          onGoal={async (weightGoalKg) => {
            await setUiAsync({ weightGoalKg });
          }}
          onClose={() => setGoal(false)}
        />
      ) : null}
      <BottomSheet isOpen={info} onOpenChange={setInfo}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            animationConfigs={SHEET_SPRING}
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 p-5"
          >
            <BottomSheet.Title>{t("body__info")}</BottomSheet.Title>
            <Text className="font-normal text-body text-muted">{t("body__explanation")}</Text>
            <Button onPress={() => setInfo(false)}>
              <Button.Label>{t("session__done")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  );
}
