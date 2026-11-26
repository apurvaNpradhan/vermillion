import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { SwipeWeekStrip } from "@/platform/ui/swipe-week-strip";
import { WeekStrip, type WeekStripMarks } from "@/platform/ui/week-strip";

import { homeDayState } from "@/training/train/strip-state";

import type { HomeWeek } from "./home-stats";

/**
 * Home's displayed week under its month label: a ledger mark on each trained day and on the day of
 * the next planned workout (the same marks as the Train strip), and the selected day ringed. A
 * swipe or the ‹ › buttons change the week, the label jumps back to today and a tap selects a day.
 */
export function HomeWeekStrip({
  week,
  selected,
  direction,
  canNext,
  onSelect,
  onMove,
  onJump,
}: {
  week: HomeWeek;
  selected: number;
  direction: -1 | 0 | 1;
  canNext: boolean;
  onSelect: (day: number) => void;
  onMove: (step: -1 | 1) => void;
  onJump: () => void;
}) {
  const { t, i18n } = useTranslation();
  const labels = useMemo(() => {
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    const day = new Intl.DateTimeFormat(i18n.language, { day: "numeric", timeZone: "UTC" });
    const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat(i18n.language, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      weekday: (value: number) => weekday.format(value),
      day: (value: number) => day.format(value),
      date: (value: number) => date.format(value),
      month: (value: number) => month.format(value),
      today: t("home__today"),
    };
  }, [i18n.language, t]);
  const marks = (day: number): WeekStripMarks | undefined => {
    const state = homeDayState(day, week);
    if (state === "done") return { state, label: t("home__day_trained") };
    if (state === "next") return { state, label: t("home__day_planned") };
    return undefined;
  };
  return (
    <SwipeWeekStrip
      title={labels.month(selected)}
      jumpLabel={t("home__jump_today")}
      previousLabel={t("muscles__previous_week")}
      nextLabel={t("muscles__next_week")}
      period={week.days[0] ?? 0}
      direction={direction}
      canNext={canNext}
      onJump={onJump}
      onMove={onMove}
    >
      <WeekStrip
        days={week.days}
        today={week.today}
        selected={selected}
        marks={marks}
        faded={(day) => day > week.today && day !== week.planned}
        pressable={(day) => day <= week.today}
        labels={labels}
        onSelect={onSelect}
      />
    </SwipeWeekStrip>
  );
}
