export type ChartPoint = { id: string; x: number; y: number; label: string };
export type ChartRange = "3M" | "1Y" | "All";

/** Equal domains land in the middle rather than dividing by zero. */
export function scale(value: number, domain: readonly [number, number], size: number): number {
  return domain[0] === domain[1]
    ? size / 2
    : ((value - domain[0]) / (domain[1] - domain[0])) * size;
}

/**
 * A zero baseline and round, evenly spaced, distinct ticks, including for an empty or all-zero
 * series. A series of whole numbers gets whole-number ticks (never 0.5 labelled "1" twice), so it
 * has at least the two ticks 0 and 1.
 */
export function ticks(values: readonly number[]): number[] {
  const finite = values.filter(Number.isFinite);
  const max = Math.max(0, ...finite);
  const rough = (max || 1) / 4;
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
