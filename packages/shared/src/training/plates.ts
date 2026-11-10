/** A plate count is the number of pairs; null means unlimited. */
export type LoadPlate = { id: string; weightKg: number; count: number | null };
export type BarLoad = { platesPerSide: LoadPlate[]; totalKg: number };
export type BarLoading = BarLoad & { exact: boolean; below: BarLoad | null; above: BarLoad | null };

// At most 100,001 totals, with precision capped at one gram per pair.
const MAX_TOTALS = 100_000;
const EPSILON = 0.0005;
type Node = {
  previous: Node | null;
  plate: LoadPlate;
  count: number;
  size: number;
  totalKg: number;
};
function unpack(node: Node | null): LoadPlate[] {
  const result: LoadPlate[] = [];
  while (node) {
    for (let i = 0; i < node.count; i++) result.push(node.plate);
    node = node.previous;
  }
  return result.sort((a, b) => b.weightKg - a.weightKg);
}

/**
 * Finds both neighbours, retaining the largest-first solution for equal totals. Bounded
 * subset sums handle custom kits where taking the largest plate alone would miss an exact
 * load. Search keys use a one-gram lattice, coarsened only above 100,000 totals.
 * Reported weights use the actual inventory weights, including exact pound conversions.
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
  const precision = 1000;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const lattice =
    available.reduce(
      (unit, p) => gcd(unit, Math.max(1, Math.round(p.weightKg * 2 * precision))),
      0,
    ) || 1;
  const span = Math.max(0, targetKg - bar.weightKg) + (available[0]?.weightKg ?? 0) * 2;
  const scale =
    precision / (lattice * Math.max(1, Math.ceil((span * precision) / lattice / MAX_TOTALS)));
  const target = Math.max(0, Math.round((targetKg - bar.weightKg) * scale));
  const ceiling = Math.min(
    MAX_TOTALS,
    target + Math.round((available[0]?.weightKg ?? 0) * 2 * scale),
  );
  const sums = new Map<number, Node | null>([[0, null]]);
  for (const plate of available) {
    const pair = Math.max(1, Math.round(plate.weightKg * 2 * scale));
    let remaining = Math.min(plate.count ?? Infinity, Math.floor(ceiling / pair));
    // Binary inventory bundles bound work to O(totals * log(count)), including unlimited kits.
    for (let bundle = 1; remaining > 0; bundle *= 2) {
      const count = Math.min(bundle, remaining);
      remaining -= count;
      // Snapshot the map: visiting newly inserted totals would reuse this inventory bundle.
      // eslint-disable-next-line unicorn/no-useless-spread
      for (const [sum, previous] of [...sums]) {
        const total = sum + pair * count;
        if (total > ceiling) continue;
        const candidate = {
          previous,
          plate,
          count,
          size: (previous?.size ?? 0) + count,
          totalKg: (previous?.totalKg ?? bar.weightKg) + plate.weightKg * 2 * count,
        };
        const existing = sums.get(total);
        if (
          existing === undefined ||
          (existing !== null &&
            (candidate.size < existing.size ||
              (candidate.size === existing.size && largerFirst(candidate, existing))))
        )
          sums.set(total, candidate);
      }
    }
  }
  let belowNode: Node | null | undefined;
  let aboveNode: Node | null | undefined;
  for (const node of sums.values()) {
    const totalKg = node?.totalKg ?? bar.weightKg;
    if (
      totalKg <= targetKg + EPSILON &&
      (belowNode === undefined || totalKg > (belowNode?.totalKg ?? bar.weightKg))
    )
      belowNode = node;
    if (
      totalKg >= targetKg - EPSILON &&
      (aboveNode === undefined || totalKg < (aboveNode?.totalKg ?? bar.weightKg))
    )
      aboveNode = node;
  }
  const load = (node: Node | null | undefined): BarLoad | null =>
    node === undefined
      ? null
      : { totalKg: node?.totalKg ?? bar.weightKg, platesPerSide: unpack(node) };
  const below = load(belowNode);
  const above = load(aboveNode);
  const chosen = below ?? above ?? { totalKg: bar.weightKg, platesPerSide: [] };
  return { ...chosen, exact: Math.abs(chosen.totalKg - targetKg) < EPSILON, below, above };
}

/** Equal-size solutions compare denomination counts without expanding tiny plate bundles. */
function largerFirst(a: Node, b: Node): boolean {
  const counts = new Map<number, number>();
  for (let at: Node | null = a; at; at = at.previous)
    counts.set(at.plate.weightKg, (counts.get(at.plate.weightKg) ?? 0) + at.count);
  for (let at: Node | null = b; at; at = at.previous)
    counts.set(at.plate.weightKg, (counts.get(at.plate.weightKg) ?? 0) - at.count);
  for (const weight of [...counts.keys()].sort((x, y) => y - x)) {
    const difference = counts.get(weight) ?? 0;
    if (difference !== 0) return difference > 0;
  }
  return false;
}
