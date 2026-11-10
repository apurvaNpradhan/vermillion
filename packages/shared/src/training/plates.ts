/** A plate count is the number of pairs; null means unlimited. */
export type LoadPlate = { id: string; weightKg: number; count: number | null };
export type BarLoad = { platesPerSide: LoadPlate[]; totalKg: number };
export type BarLoading = BarLoad & { exact: boolean; below: BarLoad | null; above: BarLoad | null };

const SCALE = 100_000_000;
// Stored cell weights round pounds to three kg decimals. Compare at that precision.
const EPSILON = 0.0005;

/**
 * Finds both neighbours, retaining the largest-first solution for equal totals. Bounded
 * subset sums handle custom kits where taking the largest plate alone would miss an exact
 * load. Integer sums preserve the kg/lb conversion without accumulating floating error.
 * A target below the bar has no lower load; a depleted kit may have no upper load.
 */
export function loadBar(
  targetKg: number,
  bar: { weightKg: number },
  plates: readonly LoadPlate[],
): BarLoading {
  if (
    !Number.isFinite(targetKg) ||
    targetKg < 0 ||
    !Number.isFinite(bar.weightKg) ||
    bar.weightKg < 0
  ) {
    throw new RangeError("Weights must be finite and nonnegative");
  }
  const available = plates.filter(
    (p) => Number.isFinite(p.weightKg) && p.weightKg > 0 && (p.count === null || p.count > 0),
  );
  available.sort((a, b) => b.weightKg - a.weightKg);
  const target = Math.max(0, Math.round((targetKg - bar.weightKg) * SCALE));
  const largestPair = Math.round((available[0]?.weightKg ?? 0) * 2 * SCALE);
  // No closest upper solution can exceed the target by more than the largest pair.
  const ceiling = target + largestPair;
  let sums = new Map<number, LoadPlate[]>([[0, []]]);
  for (const plate of available) {
    const pair = Math.round(plate.weightKg * 2 * SCALE);
    if (pair === 0) continue;
    const next = new Map(sums);
    for (const [sum, used] of sums) {
      const max = Math.min(plate.count ?? Infinity, Math.floor((ceiling - sum) / pair));
      const added: LoadPlate[] = [];
      for (let count = 1; count <= max; count++) {
        added.push(plate);
        const total = sum + pair * count;
        if (!next.has(total)) next.set(total, [...used, ...added]);
      }
    }
    sums = next;
  }
  let below: BarLoad | null = null;
  let above: BarLoad | null = null;
  for (const [sum, platesPerSide] of sums) {
    const totalKg = bar.weightKg + sum / SCALE;
    const load = { totalKg, platesPerSide };
    if (totalKg <= targetKg + EPSILON && (!below || totalKg > below.totalKg)) below = load;
    if (totalKg >= targetKg - EPSILON && (!above || totalKg < above.totalKg)) above = load;
  }
  const chosen = below ?? above ?? { totalKg: bar.weightKg, platesPerSide: [] };
  return { ...chosen, exact: Math.abs(chosen.totalKg - targetKg) < EPSILON, below, above };
}
