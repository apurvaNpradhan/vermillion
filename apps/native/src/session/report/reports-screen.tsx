import { calendarDay } from "@workspace/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ANCHORED } from "@/platform/navigation/anchored";
import { Button } from "@/platform/ui/button";
import { NumberFlow } from "@/platform/ui/number-flow";
import { ScrollPage } from "@/platform/ui/page";
import { PeriodCard } from "@/platform/ui/period-card";
import { periodStart, shiftPeriod } from "@/session/history/history-calendar";
import { HistoryCalendar } from "@/session/history/history-calendar-view";
import { historyFormat } from "@/session/history/history-format";
import { useHistorySettings, useSessionHistory } from "@/session/history/use-session-history";

import { ReportCard } from "./report-card";
import { reportKey } from "./report-period";
import { ReportsAll, ReportsYear } from "./reports-sections";

type Slot = { start: number; direction: -1 | 0 | 1 };

/**
 * Reports, opened from History's header: the report card for the month just ended, a month and
 * a year to browse with their calendar and grid (each opening its full report), and the all-time
 * facts. A day in the calendar opens History at it.
 */
export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { timezone, weekStart, weightUnit, goal } = useHistorySettings();
  const focused = useIsFocused();
  const { history, loading, failed, retry } = useSessionHistory(timezone, weekStart, focused);
  const format = useMemo(
    () => historyFormat(i18n.language, weightUnit),
    [i18n.language, weightUnit],
  );
  const today = calendarDay(new Date(), timezone);
  const currentMonth = periodStart("month", today, weekStart);
  const currentYear = periodStart("year", today, weekStart);
  const currentWeek = periodStart("week", today, weekStart);
  const [month, setMonth] = useState<Slot>({ start: currentMonth, direction: 0 });
  const [year, setYear] = useState<Slot>({ start: currentYear, direction: 0 });
  const ready = !loading && !failed;
  const monthCount = history.byMonth.get(month.start)?.totals.workouts ?? 0;
  const yearCount = history.byYear.get(year.start)?.totals.workouts ?? 0;
  const headline = (count: number) => (
    <View
      accessible
      accessibilityLabel={t("session__workout_count", { count, value: format.integer(count) })}
      className="flex-row flex-wrap items-baseline gap-1"
    >
      <NumberFlow value={count} locale={format.locale} />
      <Text className="font-normal text-body text-muted">
        {t("session__workout_unit", { count })}
      </Text>
    </View>
  );
  const openReport = (kind: "month" | "year", start: number) => (
    <Button
      variant="secondary"
      onPress={() =>
        router.push({
          pathname: "/history/report/[key]",
          params: { key: reportKey({ kind, start }) },
        })
      }
    >
      <Button.Label>
        {t(kind === "month" ? "report__open_month" : "report__open_year")}
      </Button.Label>
    </Button>
  );
  return (
    <ScrollPage title={t("report__reports_title")} back backFallback="/history">
      <ReportCard />
      {failed ? (
        <Button variant="secondary" onPress={retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      {ready ? (
        <View className="gap-6">
          <View className="gap-3">
            <PeriodCard
              title={format.monthYear(month.start)}
              headline={headline(monthCount)}
              period={month.start}
              direction={month.direction}
              previousLabel={t("session__period_previous_month")}
              nextLabel={t("session__period_next_month")}
              canPrevious
              canNext={month.start < currentMonth}
              onMove={(step) =>
                setMonth(({ start }) => ({
                  start: Math.min(currentMonth, shiftPeriod("month", start, step)),
                  direction: step,
                }))
              }
            >
              <HistoryCalendar
                month={month.start}
                today={today}
                selected={null}
                history={history}
                goal={goal}
                weekStart={weekStart}
                format={format}
                onSelect={(day) =>
                  day === null
                    ? undefined
                    : router.push(
                        {
                          pathname: "/history",
                          params: { day: new Date(day).toISOString().slice(0, 10) },
                        },
                        ANCHORED,
                      )
                }
              />
            </PeriodCard>
            {monthCount > 0 ? openReport("month", month.start) : null}
          </View>
          <View className="gap-3">
            <PeriodCard
              title={format.year(year.start)}
              headline={headline(yearCount)}
              period={year.start}
              direction={year.direction}
              previousLabel={t("session__period_previous_year")}
              nextLabel={t("session__period_next_year")}
              canPrevious
              canNext={year.start < currentYear}
              onMove={(step) =>
                setYear(({ start }) => ({
                  start: Math.min(currentYear, shiftPeriod("year", start, step)),
                  direction: step,
                }))
              }
            >
              <ReportsYear
                start={year.start}
                today={today}
                currentWeek={currentWeek}
                history={history}
                goal={goal}
                weekStart={weekStart}
                format={format}
                onMonth={(start) => {
                  setMonth({ start, direction: 0 });
                }}
              />
            </PeriodCard>
            {yearCount > 0 ? openReport("year", year.start) : null}
          </View>
          <View className="gap-3 rounded-xl bg-surface p-3">
            <Text
              accessibilityRole="header"
              className="text-overline font-semibold uppercase text-muted"
            >
              {t("session__all_time")}
            </Text>
            <ReportsAll
              history={history}
              today={today}
              currentWeek={currentWeek}
              goal={goal}
              weekStart={weekStart}
              format={format}
              onYear={(start) => setYear({ start, direction: 0 })}
            />
          </View>
        </View>
      ) : null}
    </ScrollPage>
  );
}
