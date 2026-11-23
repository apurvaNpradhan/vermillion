import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { WeekStrip, type WeekStripMarks } from "@/platform/ui/week-strip";

import type { HomeWeek } from "./home-stats";

/**
 * Home's displayed week, a dot on each trained day, the selected day ringed and the
 * day of the next planned workout hollow. Taps select a day on Home.
 */
export function HomeWeekStrip({
  week,
  selected,
  onSelect,
}: {
  week: HomeWeek;
  selected: number;
  onSelect: (day: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const labels = useMemo(() => {
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    const day = new Intl.DateTimeFormat(i18n.language, { day: "numeric", timeZone: "UTC" });
    const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full", timeZone: "UTC" });
    return {
      weekday: (value: number) => weekday.format(value),
      day: (value: number) => day.format(value),
      date: (value: number) => date.format(value),
      today: t("home__today"),
    };
  }, [i18n.language, t]);
  const marks = (day: number): WeekStripMarks | undefined => {
    if (week.trained.has(day)) return { dots: ["accent"], label: t("home__day_trained") };
    if (day === week.planned) return { planned: true, label: t("home__day_planned") };
    return undefined;
  };
  return (
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
  );
}
