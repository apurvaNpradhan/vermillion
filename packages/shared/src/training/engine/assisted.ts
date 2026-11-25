import { loadable } from "../progress/progression-steps";
import { alignToGrid, type LoadGrid } from "../progress/load-grid";
import type { WeightUnit } from "../vocabulary/vocabulary";

const EPS = 1e-4;

/**
 * The assistance one step less than `assistKg`, as the gym can make it: the next point down its
 * grid, or none at all once the grid has no lower one. Without a grid, one `stepKg` less, never
 * below none. Null when there is no assistance left to take away.
 */
export function lowerAssistance(
  assistKg: number,
  unit: WeightUnit,
  grid: LoadGrid | null,
  stepKg: number,
): number | null {
  if (assistKg <= EPS) return null;
  if (grid) {
    const below = grid.below(alignToGrid(grid, assistKg));
    return below === null ? 0 : loadable(below, unit);
  }
  return Math.max(0, loadable(assistKg - stepKg, unit));
}
