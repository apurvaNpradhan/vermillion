import type { MuscleLoad } from "@workspace/shared";

/**
 * Each muscle's share of all counted sets, in whole percent, and the width of its bar as a
 * fraction of the biggest share (so the top muscle always fills the bar).
 */
export function splitShares(loads: readonly MuscleLoad[]) {
  const total = loads.reduce((sum, load) => sum + load.sets, 0);
  const max = loads.reduce((biggest, load) => Math.max(biggest, load.sets), 0);
  return loads.map((load) => ({
    muscle: load.muscle,
    percent: total === 0 ? 0 : Math.round((load.sets / total) * 100),
    width: max === 0 ? 0 : load.sets / max,
  }));
}
