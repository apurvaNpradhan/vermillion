import type { MuscleGroup, MuscleLoad } from "@workspace/shared";

/** The most worked muscles, most sets first. */
export function topMuscles(loads: readonly MuscleLoad[], count = 3): MuscleLoad[] {
  return loads.slice(0, count);
}

/**
 * Heat for the body map: each drawn group's sets relative to the most worked one. `isGroup` says
 * which muscles the map can draw (the body map's `isBodyGroup`).
 */
export function bodyIntensity<Group extends MuscleGroup>(
  loads: readonly MuscleLoad[],
  isGroup: (muscle: MuscleGroup) => muscle is Group,
): Partial<Record<Group, number>> {
  const max = loads[0]?.sets ?? 0;
  const intensity: Partial<Record<Group, number>> = {};
  if (max <= 0) return intensity;
  for (const load of loads) if (isGroup(load.muscle)) intensity[load.muscle] = load.sets / max;
  return intensity;
}
