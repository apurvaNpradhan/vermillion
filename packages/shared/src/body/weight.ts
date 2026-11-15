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
export function ratePerWeek(series: readonly TrendPoint[]): number | null {
  const points = series.slice(-14);
  if (points.length < 2) return null;
  const meanX = (points.length - 1) / 2;
  const meanY = points.reduce((sum, p) => sum + p.trend, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  points.forEach((p, i) => {
    numerator += (i - meanX) * (p.trend - meanY);
    denominator += (i - meanX) ** 2;
  });
  return (numerator / denominator) * 7;
}
export function weightChanges(series: readonly TrendPoint[]) {
  return [3, 7, 14, 30, 90].map((days) => {
    const change = changeOver(series, days);
    const direction: "increase" | "decrease" | "stable" =
      change === null || Math.abs(change) <= 0.1 ? "stable" : change > 0 ? "increase" : "decrease";
    return { days, change, direction };
  });
}
export function weeklyPoints(series: readonly TrendPoint[]): TrendPoint[] {
  const weeks = new Map<string, TrendPoint>();
  for (const point of series) {
    const day = new Date(stamp(point.date));
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    weeks.set(day.toISOString().slice(0, 10), point);
  }
  return [...weeks.values()];
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
