import { SyncBanner } from "@/sync";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Info, DotsThree, Target, Trash } from "phosphor-react-native";
import { useThemeColor, BottomSheet } from "heroui-native";
import { formatWeight, weeklyPoints, changeOver, type TrendPoint } from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { LineChart } from "@/platform/ui/charts/chart";
import { Sparkline } from "@/platform/ui/charts/sparkline";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { SwipeRow } from "@/platform/ui/swipe-row";
import { usePreferences } from "@/preferences";
import { useWeight } from "./use-weight";
import { useLogWeight } from "./use-log-weight";
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
  const state = useWeight();
  const actions = useLogWeight();
  const { t, i18n } = useTranslation();
  const { setUiAsync } = usePreferences();
  const [range, setRange] = useState(1);
  const [logging, setLogging] = useState(false);
  const [entry, setEntry] = useState<WatchedMeasurement>();
  const [info, setInfo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [goal, setGoal] = useState(false);
  const ink = useThemeColor("foreground");
  const days = ranges[range]?.days ?? 30;
  const start = Date.parse(state.today) - days * 86400000;
  const selected = state.series.filter((p) => Date.parse(p.date) >= start);
  const series = days >= 365 ? weeklyPoints(selected) : selected;
  const format = (value: number) =>
    t("body__value", { value: formatWeight(value, state.unit), unit: state.unit });
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(value),
    );
  const points = (rows: readonly TrendPoint[]) =>
    rows.map((p) => ({ id: p.date, x: Date.parse(p.date), y: p.trend, label: date(p.date) }));
  const delta = changeOver(selected, Math.max(0, selected.length - 1));
  return (
    <ScrollPage title={t("body__title")}>
      <SyncBanner />
      <View className="gap-6">
        <View className="flex-row justify-between">
          <Text className="text-caption text-muted">{t("body__trend_now")}</Text>
          <View className="flex-row gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("body__info")}
              onPress={() => setInfo(true)}
            >
              <Info size={24} color={ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("body__options")}
              onPress={() => setMenu(true)}
            >
              <DotsThree size={24} color={ink} />
            </Pressable>
          </View>
        </View>
        <View className="gap-2 border-b border-separator pb-5">
          <Text
            className="text-numeric-xl text-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {state.trend === null
              ? t(state.loading ? "common__loading" : "body__empty")
              : format(state.trend)}
          </Text>
          <Text className="text-body text-muted">
            {t("body__headline_change", {
              change: delta === null ? t("body__no_data") : format(delta),
              rate: state.rate === null ? t("body__no_data") : format(state.rate),
            })}
          </Text>
          <Text className="text-caption text-muted">
            {selected[0]
              ? t("body__date_range", {
                  from: date(selected[0].date),
                  to: date(selected.at(-1)?.date ?? state.today),
                })
              : null}
          </Text>
        </View>
        {state.failed ? (
          <Button onPress={state.retry}>
            <Button.Label>{t("training__retry")}</Button.Label>
          </Button>
        ) : null}
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
        <Button
          onPress={() => {
            setEntry(undefined);
            setLogging(true);
          }}
        >
          <Button.Label>{t("body__log")}</Button.Label>
        </Button>
        <View className="gap-3">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("body__changes")}
          </Text>
          {state.changes.map((change) => (
            <View
              key={change.days}
              className="flex-row items-center justify-between gap-3 border-b border-separator py-3"
            >
              <Text className="text-body text-muted">
                {t("body__days", { count: change.days })}
              </Text>
              <Sparkline values={state.series.slice(-change.days - 1).map((p) => p.trend)} />
              <View className="items-end">
                <Text className="text-body text-foreground">
                  {change.change === null ? t("body__no_data") : format(change.change)}
                </Text>
                <Text className="text-caption text-muted">
                  {t(
                    change.direction === "stable"
                      ? "body__stable"
                      : change.direction === "increase"
                        ? "body__increase"
                        : "body__decrease",
                  )}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View className="gap-3">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("body__habit")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {state.days.map((day) => (
              <View
                key={day.date}
                accessible
                accessibilityLabel={t(day.logged ? "body__day_logged" : "body__day_missing", {
                  date: date(day.date),
                })}
                className={`h-7 w-7 items-center justify-center rounded-sm ${day.logged ? "bg-foreground" : "bg-default"}`}
              >
                <Text className={`text-caption ${day.logged ? "text-background" : "text-muted"}`}>
                  {Number(day.date.slice(-2))}
                </Text>
              </View>
            ))}
          </View>
          <Text className="text-caption text-muted">
            {t("body__habit_count", { count: state.days.filter((d) => d.logged).length })}
          </Text>
        </View>
        <View className="gap-4">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("body__entries")}
          </Text>
          {state.months.map(([month, entries]) => (
            <View key={month} className="gap-2">
              <Text className="text-caption text-muted">
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
                      className="flex-row justify-between border-b border-separator py-4"
                    >
                      <Text className="text-body text-muted">{date(row.local_date)}</Text>
                      <Text className="text-body text-foreground">{format(row.value)}</Text>
                    </Pressable>
                  )}
                </SwipeRow>
              ))}
            </View>
          ))}
        </View>
      </View>
      {state.hasMoreEntries ? (
        <Button variant="tertiary" onPress={state.loadMoreEntries}>
          <Button.Label>{t("body__more_entries")}</Button.Label>
        </Button>
      ) : null}
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
      <ActionSheet
        title={t("body__options")}
        isOpen={menu}
        onOpenChange={setMenu}
        actions={[
          { key: "goal", label: t("body__goal"), icon: Target, onPress: () => setGoal(true) },
        ]}
      />
      <BottomSheet isOpen={info} onOpenChange={setInfo}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 p-5"
          >
            <BottomSheet.Title>{t("body__info")}</BottomSheet.Title>
            <Text className="text-body text-muted">{t("body__explanation")}</Text>
            <Button onPress={() => setInfo(false)}>
              <Button.Label>{t("session__done")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </ScrollPage>
  );
}
