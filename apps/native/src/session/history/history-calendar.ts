import { weekColumn, type WeekStart } from "@workspace/shared";

/** A calendar month: `month` is 0-11. */
export type Month = { year: number; month: number };

/** One square of the month grid: a blank before the 1st, or a day with its Session count. */
export type CalendarCell =
  | { kind: "blank"; key: string }
  | { kind: "day"; key: string; day: number; date: string; sessions: number };

/** The calendar date (`2026-11-16`) of an instant in `timezone`. */
export function localDate(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

export function monthOf(instant: string, timezone: string): Month {
  const [year, month] = localDate(instant, timezone).split("-").map(Number);
  return { year: year ?? 1970, month: (month ?? 1) - 1 };
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month;

/**
 * The instants to query for a month's Sessions: the month padded by a day each side, so every
 * zone's local month is covered. Filter the result with {@link inMonth}.
 */
export function monthQueryRange({ year, month }: Month) {
  return {
    from: new Date(Date.UTC(year, month, 0)).toISOString(),
    to: new Date(Date.UTC(year, month + 1, 2)).toISOString(),
  };
}

/** Whether a Session that started at `instant` falls in `month` in the user's zone. */
export function inMonth(instant: string, month: Month, timezone: string): boolean {
  return sameMonth(monthOf(instant, timezone), month);
}

/** The squares of a month: blanks up to the 1st (in the user's week order), then one cell per day. */
export function monthCells(
  month: Month,
  counts: ReadonlyMap<string, number>,
  weekStart: WeekStart,
): CalendarCell[] {
  const first = new Date(Date.UTC(month.year, month.month, 1));
  const length = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const lead = weekColumn(first.getUTCDay(), weekStart);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    ...Array.from({ length: lead }, (_, index): CalendarCell => ({
      kind: "blank",
      key: `blank-${index}`,
    })),
    ...Array.from({ length }, (_, index): CalendarCell => {
      const date = `${month.year}-${pad(month.month + 1)}-${pad(index + 1)}`;
      return { kind: "day", key: date, day: index + 1, date, sessions: counts.get(date) ?? 0 };
    }),
  ];
}
