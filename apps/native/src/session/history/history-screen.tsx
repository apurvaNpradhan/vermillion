import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { calendarDay, type WeekStart } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { useFocusEffect, useRouter } from "expo-router";
import { Barbell, CalendarPlus, ClockCounterClockwise } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SegmentedControl, type SegmentedOption } from "@/platform/ui/segmented-control";

import { groupSessionWeeks } from "./history";
import {
  emptyTotals,
  historyWindow,
  periodStart,
  shiftPeriod,
  type Period,
} from "./history-calendar";
import { HistoryCalendar } from "./history-calendar-view";
import { historyFormat } from "./history-format";
import { HistoryAll, HistoryWeek, HistoryYear } from "./history-period-details";
import { HistoryRow, WeekHeading } from "./history-rows";
import { NumberFlow } from "@/platform/ui/number-flow";
import { PeriodCard } from "@/platform/ui/period-card";
import { useHistorySettings, useSessionHistory } from "./use-session-history";

type HistoryItem =
  | { kind: "week"; id: string; sessions: readonly FinishedSession[] }
  | { kind: "session"; id: string; session: FinishedSession };

type Selection = { period: Period; anchor: number | null; direction: -1 | 0 | 1 };
const EMPTY_SESSIONS: readonly FinishedSession[] = [];

function useToday(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      const refresh = () =>
        setNow((previous) => {
          const current = new Date();
          return calendarDay(previous, timezone) === calendarDay(current, timezone)
            ? previous
            : current;
        });
      refresh();
      const timer = setInterval(refresh, 60_000);
      return () => clearInterval(timer);
    }, [timezone]),
  );
  return calendarDay(now, timezone);
}

export function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const reduced = useReducedMotion();
  const { timezone, weekStart, weightUnit, goal } = useHistorySettings();
  const today = useToday(timezone);
  const [selection, setSelection] = useState<Selection>({
    period: "month",
    anchor: null,
    direction: 0,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const { period, anchor, direction } = selection;
  const latest = periodStart(period, today, weekStart);
  const start = Math.min(latest, periodStart(period, anchor ?? today, weekStart));
  const readWindow = historyWindow(period, start, weekStart);
  const { history, loading, failed, retry } = useSessionHistory(readWindow, timezone, weekStart);
  const currentWeek = periodStart("week", today, weekStart);
  const format = useMemo(
    () => historyFormat(i18n.language, weightUnit),
    [i18n.language, weightUnit],
  );
  const options: SegmentedOption<Period>[] = [
    { value: "week", label: t("session__period_week") },
    { value: "month", label: t("session__period_month") },
    { value: "year", label: t("session__period_year") },
    { value: "all", label: t("session__period_all") },
  ];
  const canNext = period !== "all" && start < latest;
  const canPrevious = period !== "all";
  const move = (step: -1 | 1) => {
    if (step === 1 ? !canNext : !canPrevious) return;
    const next = shiftPeriod(period, start, step);
    setSelected(null);
    setSelection({ period, anchor: next === latest ? null : next, direction: step });
  };
  const drillDown = (next: "month" | "year", at: number) => {
    setSelected(null);
    setSelection({
      period: next,
      anchor: at === periodStart(next, today, weekStart) ? null : at,
      direction: 0,
    });
  };

  const bucket =
    period === "week"
      ? history.byWeek.get(start)
      : period === "month"
        ? history.byMonth.get(start)
        : history.byYear.get(start);
  const count = period === "all" ? history.totals.workouts : (bucket?.totals.workouts ?? 0);
  const activeDay =
    period === "month" &&
    selected !== null &&
    selected >= start &&
    selected < shiftPeriod("month", start, 1)
      ? selected
      : null;
  const sessions =
    activeDay !== null
      ? (history.byDay.get(activeDay) ?? EMPTY_SESSIONS)
      : period === "all"
        ? history.sessions
        : (bucket?.sessions ?? EMPTY_SESSIONS);
  const items = useMemo(
    () => listItems(sessions, activeDay === null && period !== "week", timezone, weekStart),
    [sessions, activeDay, period, timezone, weekStart],
  );
  const openLog = () => router.push("/history/log-past");
  const ready = !loading && !failed;
  const periodTitle =
    period === "all"
      ? t("session__all_time")
      : period === "week"
        ? t("session__week", { date: format.medium(start) })
        : period === "month"
          ? format.monthYear(start)
          : format.year(start);

  const entryOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(ready ? 1 : 0, {
      duration: reduced ? 120 : 150,
      reduceMotion: ReduceMotion.Never,
    }),
  }));

  return (
    <Page
      title={t("session__history")}
      actions={
        <>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("muscles__open")}
            onPress={() => router.push("/muscles")}
          >
            <Barbell size={24} weight="regular" color={subtle} />
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("session__log_past")}
            onPress={openLog}
          >
            <CalendarPlus size={24} weight="regular" color={subtle} />
          </Button>
        </>
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <AnimatedLegendList
          {...scroll}
          recycleItems={false}
          data={ready ? items : []}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          estimatedItemSize={95}
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View className="gap-3 pb-2">
              {header}
              <SegmentedControl
                options={options}
                value={period}
                accessibilityLabel={t("session__history_period")}
                onChange={(next) => {
                  setSelected(null);
                  setSelection({ period: next, anchor, direction: 0 });
                }}
              />
              {ready && (
                <Animated.View
                  entering={FadeIn.duration(reduced ? 120 : 150).reduceMotion(ReduceMotion.Never)}
                >
                  <PeriodCard
                    title={periodTitle}
                    headline={
                      <View
                        accessible
                        accessibilityLabel={t("session__workout_count", {
                          count,
                          value: format.integer(count),
                        })}
                        className="flex-row flex-wrap items-baseline gap-1"
                      >
                        <NumberFlow value={count} locale={format.locale} />
                        <Text className="text-body text-muted">
                          {t("session__workout_unit", { count })}
                        </Text>
                      </View>
                    }
                    period={start}
                    previousLabel={t("session__period_previous")}
                    nextLabel={t("session__period_next")}
                    direction={direction}
                    canPrevious={canPrevious}
                    canNext={canNext}
                    onMove={move}
                  >
                    {period === "month" && (
                      <HistoryCalendar
                        month={start}
                        today={today}
                        selected={activeDay}
                        history={history}
                        goal={goal}
                        weekStart={weekStart}
                        format={format}
                        onSelect={setSelected}
                      />
                    )}
                    {period === "week" && (
                      <HistoryWeek
                        start={start}
                        today={today}
                        history={history}
                        goal={goal}
                        format={format}
                      />
                    )}
                    {period === "year" && (
                      <HistoryYear
                        start={start}
                        today={today}
                        currentWeek={currentWeek}
                        history={history}
                        goal={goal}
                        weekStart={weekStart}
                        format={format}
                        onMonth={(month) => drillDown("month", month)}
                      />
                    )}
                    {period === "all" && (
                      <HistoryAll
                        history={history}
                        today={today}
                        currentWeek={currentWeek}
                        goal={goal}
                        weekStart={weekStart}
                        format={format}
                        onYear={(year) => drillDown("year", year)}
                      />
                    )}
                  </PeriodCard>
                </Animated.View>
              )}
            </View>
          }
          ListEmptyComponent={
            failed ? (
              <Button variant="secondary" onPress={retry}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            ) : ready ? (
              <EmptyState
                icon={ClockCounterClockwise}
                title={
                  activeDay !== null
                    ? t("session__history_empty_day")
                    : t("session__history_empty_period")
                }
                action={
                  activeDay === null
                    ? { label: t("session__log_past"), onPress: openLog }
                    : undefined
                }
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Animated.View style={entryOpacity}>
              {item.kind === "week" ? (
                <WeekHeading
                  day={Date.parse(item.id)}
                  sessions={item.sessions}
                  totalsFor={(id) => history.bySession.get(id)?.totals ?? emptyTotals}
                  format={format}
                />
              ) : (
                <HistoryRow
                  session={item.session}
                  stats={history.bySession.get(item.id)}
                  compact={activeDay !== null}
                  format={format}
                  timezone={timezone}
                  onPress={() =>
                    router.push({ pathname: "/history/[id]", params: { id: item.id } })
                  }
                />
              )}
            </Animated.View>
          )}
        />
      )}
    </Page>
  );
}

function listItems(
  sessions: readonly FinishedSession[],
  groupByWeek: boolean,
  timezone: string,
  weekStart: WeekStart,
): HistoryItem[] {
  const rows = (entries: readonly FinishedSession[]) =>
    entries.map((session): HistoryItem => ({ kind: "session", id: session.id, session }));
  if (!groupByWeek) return rows(sessions);
  return groupSessionWeeks(sessions, timezone, weekStart).flatMap(
    ({ week, sessions }): HistoryItem[] => [
      { kind: "week", id: week, sessions },
      ...rows(sessions),
    ],
  );
}
