import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { WeekStrip, type WeekStripMarks } from "@/platform/ui/week-strip";

import type { HomeWeek } from "./home-stats";

/**
 * Home's header strip: this week's seven days, a dot on each trained day, today ringed and the
 * day of the next planned workout hollow. A past trained day opens its Session.
 */
export function HomeWeekStrip({
  week,
  onOpenSession,
}: {
  week: HomeWeek;
  onOpenSession: (id: string) => void;
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
    if (week.sessionByDay.has(day)) return { dots: ["success"], label: t("home__day_trained") };
    if (day === week.planned) return { planned: true, label: t("home__day_planned") };
    return undefined;
  };
  return (
    <WeekStrip
      days={week.days}
      today={week.today}
      marks={marks}
      faded={(day) => day > week.today && day !== week.planned}
      pressable={(day) => week.sessionByDay.has(day)}
      labels={labels}
      onSelect={(day) => {
        const id = week.sessionByDay.get(day);
        if (id !== undefined) onOpenSession(id);
      }}
    />
  );
}
