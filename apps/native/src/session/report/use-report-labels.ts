import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";

import { historyFormat } from "../history/history-format";
import { previousReport, type ReportPeriod } from "./report-period";
import { trainedTime, type ReportLabels, type StatId } from "./report-view";

const STAT_KEYS = {
  sessions: "stats__sessions",
  days: "report__stat_days",
  sets: "stats__sets",
  volume: "stats__volume",
  time: "report__stat_time",
} as const satisfies Record<StatId, string>;

/** The words, names and number formats of one report, in the user's language and unit. */
export function useReportLabels(period: ReportPeriod) {
  const { t, i18n } = useTranslation();
  const { weightUnit } = usePreferences().preferences.ui;
  const { start, kind } = period;
  return useMemo(() => {
    const format = historyFormat(i18n.language, weightUnit);
    const percent = new Intl.NumberFormat(i18n.language, { style: "percent" });
    const name = (day: number) => (kind === "year" ? format.year(day) : format.longMonth(day));
    const labels: ReportLabels = {
      statLabel: (id) => t(STAT_KEYS[id]),
      count: format.integer,
      volume: (kg) => ({
        value:
          weightUnit === "kg"
            ? format.decimal(format.volumeValue(kg))
            : format.integer(Math.round(format.volumeValue(kg))),
        unit: t(format.volumeUnit),
      }),
      time: (seconds) => {
        const { unit, value } = trainedTime(seconds);
        return {
          value: format.decimal(value),
          unit: t(unit === "min" ? "report__unit_minutes" : "report__unit_hours"),
        };
      },
      percent: (value) => percent.format(value / 100),
      sets: (count) => t("stats__sets", { count }),
      records: (count) => t("share__records", { count }),
      streak: (weeks) => t("session__streak_weeks", { count: weeks, value: format.integer(weeks) }),
      versus: t("report__versus", { period: name(previousReport({ kind, start }).start) }),
    };
    return {
      labels,
      format,
      title:
        kind === "year"
          ? t("report__year_title", { year: format.year(start) })
          : format.monthYear(start),
      kicker: t(kind === "year" ? "report__kicker_year" : "report__kicker_month"),
    };
  }, [i18n.language, weightUnit, t, start, kind]);
}
