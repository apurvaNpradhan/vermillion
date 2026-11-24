import { weekRange, type WeekStart } from "@workspace/shared";

export type ChartPoint = { id: string; x: number; y: number; label: string };
export type ChartRange = "3M" | "1Y" | "All";

/** Equal domains land in the middle rather than dividing by zero. */
export function scale(value: number, domain: readonly [number, number], size: number): number {
  return domain[0] === domain[1]
    ? size / 2
    : ((value - domain[0]) / (domain[1] - domain[0])) * size;
}

/** At most this many gridlines, the baseline included. */
export const MAX_GRIDLINES = 4;

/**
 * A zero baseline and round, evenly spaced, distinct ticks, including for an empty or all-zero
 * series. A series of whole numbers gets whole-number ticks (never 0.5 labelled "1" twice), so it
 * has at least the two ticks 0 and 1. Never more than `MAX_GRIDLINES`.
 */
export function ticks(values: readonly number[]): number[] {
  const finite = values.filter(Number.isFinite);
  const max = Math.max(0, ...finite);
  const rough = (max || 1) / (MAX_GRIDLINES - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10;
  const natural = step * magnitude;
  const interval = finite.every(Number.isInteger) ? Math.max(1, natural) : natural;
  return Array.from({ length: Math.ceil((max || 1) / interval) + 1 }, (_, i) =>
    Number((i * interval).toPrecision(12)),
  );
}

export function rangePoints(
  points: readonly ChartPoint[],
  range: ChartRange,
  now: number,
): ChartPoint[] {
  const start = new Date(now);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  if (range === "3M") start.setUTCMonth(start.getUTCMonth() - 3);
  if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return points.filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (range === "All" || point.x >= start.getTime()),
  );
}

export function nearestIndex(positions: readonly number[], x: number): number {
  "worklet";
  let nearest = -1;
  let distance = Infinity;
  for (let i = 0; i < positions.length; i += 1) {
    const delta = Math.abs((positions[i] ?? 0) - x);
    if (delta < distance) {
      nearest = i;
      distance = delta;
    }
  }
  return nearest;
}

/** Rounding into display units can give several ticks the same label, especially near zero. */
export function labelledTicks(
  values: readonly number[],
  format: (value: number) => string,
): number[] {
  return [...new Map(values.map((value) => [format(value), value])).values()];
}

/** Round steps for a time axis, in seconds: 1, 2, 5, 10, 15, 30 s, then minutes and hours. */
export const TIME_STEPS: readonly number[] = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400,
];

function stepCandidates(steps: readonly number[] | undefined): number[] {
  if (steps) return [...steps];
  return Array.from({ length: 16 }, (_, k) => [1, 2, 5].map((f) => f * 10 ** (k - 5))).flat();
}

/**
 * Round, evenly spaced ticks around the data (not from zero), for series whose baseline means
 * nothing, such as body weight or pace. At most `MAX_GRIDLINES`; `steps` lists the round steps to
 * choose from (a time axis uses `TIME_STEPS`). A single value gets a tick either side.
 */
export function dataTicks(values: readonly number[], steps?: readonly number[]): number[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const candidates = stepCandidates(steps);
  if (min === max) {
    const step = candidates.find((candidate) => candidate >= Math.abs(min) * 0.05) ?? 1;
    return [min - step, min, min + step].map((v) => Number(v.toPrecision(12)));
  }
  for (const step of candidates) {
    if (step < (max - min) / (MAX_GRIDLINES - 1)) continue;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const count = Math.round((end - start) / step) + 1;
    if (count > MAX_GRIDLINES) continue;
    return Array.from({ length: count }, (_, i) => Number((start + i * step).toPrecision(12)));
  }
  return [min, max];
}

export type Aggregate = "max" | "min" | "sum";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 1970-01-01 was a Thursday, so Monday weeks start 4 days after the epoch. */
const MONDAY_OFFSET_MS = 4 * 24 * 60 * 60 * 1000;

/** The account's week: its time zone and the day it starts on, as History groups by. */
export type ChartWeek = { timezone: string; weekStart: WeekStart };

/**
 * One point per week instead of one per session: the best of the week (highest or lowest), or the
 * total for totals such as reps and volume. The week keeps the date and id of its last session.
 * Weeks follow `week` (the account's time zone and preferred first day, the same helper History
 * uses); without it they are UTC Monday weeks. Points must be in time order; the result is too.
 */
export function aggregateByWeek(
  points: readonly ChartPoint[],
  how: Aggregate,
  week?: ChartWeek,
): ChartPoint[] {
  const weeks = new Map<number, ChartPoint>();
  for (const point of points) {
    const key = week
      ? weekRange(new Date(point.x), week.timezone, week.weekStart).start
      : Math.floor((point.x - MONDAY_OFFSET_MS) / WEEK_MS);
    const before = weeks.get(key);
    const y =
      before === undefined
        ? point.y
        : how === "sum"
          ? before.y + point.y
          : how === "min"
            ? Math.min(before.y, point.y)
            : Math.max(before.y, point.y);
    weeks.set(key, { ...point, y });
  }
  return [...weeks.values()];
}
