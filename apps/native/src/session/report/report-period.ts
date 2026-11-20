import { shiftPeriod } from "../history/history-calendar";

/** A report covers one calendar month or one calendar year. */
export type ReportKind = "month" | "year";

/** `start` is the first calendar day (UTC midnight) of the month or year. */
export type ReportPeriod = { kind: ReportKind; start: number };

const pad = (value: number) => String(value).padStart(2, "0");

/** `2026-10` for a month, `2026` for a year: the id in routes, shares and dismissals. */
export function reportKey(period: ReportPeriod): string {
  const date = new Date(period.start);
  const year = date.getUTCFullYear();
  return period.kind === "year" ? String(year) : `${year}-${pad(date.getUTCMonth() + 1)}`;
}

export function parseReportKey(key: string): ReportPeriod | null {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  if (match[2] === undefined) return { kind: "year", start: Date.UTC(year, 0, 1) };
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { kind: "month", start: Date.UTC(year, month - 1, 1) } : null;
}

/** The first day after the period. */
export const reportEnd = (period: ReportPeriod) => shiftPeriod(period.kind, period.start, 1);

export const previousReport = (period: ReportPeriod): ReportPeriod => ({
  kind: period.kind,
  start: shiftPeriod(period.kind, period.start, -1),
});

/** The period that holds a calendar day. */
export function reportContaining(kind: ReportKind, day: number): ReportPeriod {
  const date = new Date(day);
  return {
    kind,
    start:
      kind === "year"
        ? Date.UTC(date.getUTCFullYear(), 0, 1)
        : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  };
}

/** Home offers last period's report during the first days of a month. */
export const REPORT_CARD_DAYS = 7;

/**
 * The report Home offers on `today` (a calendar day): in the first {@link REPORT_CARD_DAYS} days
 * of a month, last month's; in January, last year's Year in review instead. Otherwise none.
 */
export function reportCardPeriod(today: number): ReportPeriod | null {
  const date = new Date(today);
  if (date.getUTCDate() > REPORT_CARD_DAYS) return null;
  const current = reportContaining("month", today);
  return date.getUTCMonth() === 0
    ? { kind: "year", start: shiftPeriod("year", reportContaining("year", today).start, -1) }
    : previousReport(current);
}
