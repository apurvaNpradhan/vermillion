import { weekStartDay } from "../training/plans/week";
import type { WeekStart } from "../training/vocabulary/vocabulary";

export type WeightEntry = { local_date: string; value: number };
export type DailyWeight = { date: string; scale: number };
export type TrendPoint = {
  date: string;
  scale: number | null;
  trend: number;
  interpolated: boolean;
};
const DAY = 86400000;
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
export function dailyWeights(entries: readonly WeightEntry[]): DailyWeight[] {
  const days = new Map<string, { total: number; count: number }>();
  for (const entry of entries) {
    const day = days.get(entry.local_date) ?? { total: 0, count: 0 };
    day.total += entry.value;
    day.count++;
    days.set(entry.local_date, day);
  }
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, scale: day.total / day.count }));
}
/**
 * The bodyweight rule for a day: the latest measured day through that date, the first measured
 * day for older dates, then the profile weight. `daily` is in the order produced by dailyWeights.
 * Build it once and call it per date; it binary-searches without copying the series.
 */
export function bodyweightLookup(
  daily: readonly DailyWeight[],
  profileKg: number | null,
): (date: string) => number | null {
  return (date) => {
    let low = 0;
    let high = daily.length - 1;
    let found: DailyWeight | undefined;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const entry = daily[middle];
      if (entry === undefined) break;
      if (entry.date <= date) {
        found = entry;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found?.scale ?? daily[0]?.scale ?? profileKg;
  };
}

/** Uses measured daily weights in the order produced by dailyWeights. */
export function bodyweightForDate(
  daily: readonly DailyWeight[],
  date: string,
  profileKg: number | null,
): number | null {
  return bodyweightLookup(daily, profileKg)(date);
}

export function trendSeries(daily: readonly DailyWeight[], alpha = 0.1): TrendPoint[] {
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError("Invalid alpha");
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const result: TrendPoint[] = [];
  let trend = sorted[0]?.scale ?? 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i];
    if (!next) continue;
    const previous = sorted[i - 1];
    const gap = previous ? Math.round((stamp(next.date) - stamp(previous.date)) / DAY) : 1;
    for (let day = 1; day <= gap; day++) {
      const scale = previous
        ? previous.scale + ((next.scale - previous.scale) * day) / gap
        : next.scale;
      trend = alpha * scale + (1 - alpha) * trend;
      const interpolated = day < gap;
      result.push({
        date: new Date(stamp(next.date) - (gap - day) * DAY).toISOString().slice(0, 10),
        scale: interpolated ? null : next.scale,
        trend,
        interpolated,
      });
    }
  }
  return result;
}
export function trendAt(series: readonly TrendPoint[], date: string): number | null {
  return [...series].reverse().find((p) => p.date <= date)?.trend ?? null;
}
export function changeOver(series: readonly TrendPoint[], days: number): number | null {
  const last = series.at(-1);
  if (!last) return null;
  const date = new Date(stamp(last.date) - days * DAY).toISOString().slice(0, 10);
  const before = trendAt(series, date);
  return before === null ? null : last.trend - before;
}
export function ratePerWeek(series: readonly TrendPoint[], today?: string): number | null {
  const last = [...series].reverse().find((point) => point.scale !== null);
  if (!last || (today !== undefined && stamp(today) - stamp(last.date) > 10 * DAY)) return null;
  const lastDay = stamp(last.date);
  const points = series.flatMap((point) => {
    const offset = (stamp(point.date) - lastDay) / DAY;
    return offset > -14 && point.scale !== null ? [{ offset, scale: point.scale }] : [];
  });
  if (points.length < 4 || (points[0]?.offset ?? 0) > -10) return null;
  const meanX = points.reduce((sum, point) => sum + point.offset, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.scale, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const { offset, scale } of points) {
    numerator += (offset - meanX) * (scale - meanY);
    denominator += (offset - meanX) ** 2;
  }
  return (numerator / denominator) * 7;
}
export type WeightDirection = "increase" | "decrease" | "stable";
export function weightChanges(series: readonly TrendPoint[]) {
  return [3, 7, 14, 30, 90].map((days) => {
    const change = changeOver(series, days);
    // No comparison point yet: no direction either, rather than a misleading "Stable".
    const direction: WeightDirection | null =
      change === null
        ? null
        : Math.abs(change) <= 0.1
          ? "stable"
          : change > 0
            ? "increase"
            : "decrease";
    return { days, change, direction };
  });
}
/**
 * One point per week for long ranges (weeks start on `weekStart`): the week's last trend value, and the average
 * of the scale weights actually logged that week (null, and `interpolated`, when none were).
 */
export function weeklyPoints(series: readonly TrendPoint[], weekStart: WeekStart): TrendPoint[] {
  const weeks = new Map<string, { last: TrendPoint; total: number; count: number }>();
  for (const point of series) {
    const key = new Date(weekStartDay(stamp(point.date), weekStart)).toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { last: point, total: 0, count: 0 };
    week.last = point;
    if (point.scale !== null) {
      week.total += point.scale;
      week.count++;
    }
    weeks.set(key, week);
  }
  return [...weeks.values()].map(({ last, total, count }) => ({
    date: last.date,
    trend: last.trend,
    scale: count ? total / count : null,
    interpolated: count === 0,
  }));
}
export function weighInDays(entries: readonly WeightEntry[], today: string, count = 30) {
  const dates = new Set(entries.map((e) => e.local_date));
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(stamp(today) - (count - 1 - i) * DAY).toISOString().slice(0, 10);
    return { date, logged: dates.has(date) };
  });
}
export const kgToLb = (kg: number) => kg / 0.45359237;
export const lbToKg = (lb: number) => lb * 0.45359237;
export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inches: number) => inches * 2.54;
export const displayMeasurement = (value: number) => Math.round(value * 10) / 10;
/** A body weight for display: kilograms or pounds to one decimal, locale-formatted. */
export function formatBodyWeight(kg: number, unit: "kg" | "lb", locale?: string): string {
  const shown = unit === "lb" ? kgToLb(kg) : kg;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(displayMeasurement(shown));
}
/** The value a weight field shows for a stored kilogram value: the unit's figure to one decimal. */
export const shownWeight = (kg: number, unit: "kg" | "lb") =>
  displayMeasurement(unit === "lb" ? kgToLb(kg) : kg);
