import type { WeekStart } from "@workspace/shared";
import { CaretDown, CaretUp } from "phosphor-react-native";
import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SwipeWeekStrip } from "@/platform/ui/swipe-week-strip";
import { WeekStrip } from "@/platform/ui/week-strip";
import { stripDays } from "@/platform/ui/week-strip-math";

import { periodStart, shiftPeriod, type History } from "./history-calendar";
import { HistoryCalendar } from "./history-calendar-view";
import type { HistoryFormat } from "./history-format";

/**
 * History's top: the same week strip as Home (a dot on each trained day), which a pull down
 * turns into the month calendar and a pull up (or the handle) turns back. A swipe steps a week, or
 * a month once expanded, the month label jumps to today and a tap on a day jumps the list to it.
 */
export function HistoryWeekStrip({
  anchor,
  today,
  selected,
  expanded,
  direction,
  history,
  goal,
  weekStart,
  format,
  onSelect,
  onMove,
  onJump,
  onExpandedChange,
}: {
  /** A day inside the week or month shown. */
  anchor: number;
  today: number;
  selected: number | null;
  expanded: boolean;
  direction: -1 | 0 | 1;
  history: History;
  goal: number | null;
  weekStart: WeekStart;
  format: HistoryFormat;
  onSelect: (day: number | null) => void;
  /** One week back or forward; one month when expanded. */
  onMove: (step: -1 | 1) => void;
  onJump: () => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const week = periodStart("week", anchor, weekStart);
  const month = periodStart("month", anchor, weekStart);
  const current = periodStart("week", today, weekStart);
  const labels = useMemo(
    () => ({
      weekday: format.weekday,
      day: format.day,
      date: format.full,
      today: t("home__today"),
    }),
    [format, t],
  );
  const canNext = expanded
    ? shiftPeriod("month", month, 1) <= periodStart("month", today, weekStart)
    : week < current;
  return (
    <SwipeWeekStrip
      title={format.monthYear(anchor)}
      jumpLabel={t("home__jump_today")}
      previousLabel={t(expanded ? "session__period_previous_month" : "muscles__previous_week")}
      nextLabel={t(expanded ? "session__period_next_month" : "muscles__next_week")}
      period={expanded ? month : week}
      direction={direction}
      canNext={canNext}
      onJump={onJump}
      onMove={onMove}
      onVertical={(step) => onExpandedChange(step === 1)}
      accessory={
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel={t(
            expanded ? "session__collapse_calendar" : "session__expand_calendar",
          )}
          accessibilityState={{ expanded }}
          onPress={() => onExpandedChange(!expanded)}
        >
          {expanded ? <CaretUp size={20} color={subtle} /> : <CaretDown size={20} color={subtle} />}
        </Button>
      }
    >
      {expanded ? (
        <HistoryCalendar
          month={month}
          today={today}
          selected={selected}
          history={history}
          goal={goal}
          weekStart={weekStart}
          format={format}
          onSelect={onSelect}
        />
      ) : (
        <WeekStrip
          days={stripDays(week)}
          today={today}
          selected={selected ?? -1}
          marks={(day) =>
            history.byDay.has(day) ? { dots: ["accent"], label: t("home__day_trained") } : undefined
          }
          pressable={(day) => day <= today}
          faded={(day) => day > today}
          labels={labels}
          onSelect={(day) => onSelect(selected === day ? null : day)}
        />
      )}
    </SwipeWeekStrip>
  );
}
