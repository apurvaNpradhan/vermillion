import type { PlannedSet } from "@workspace/shared";

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** "3 × 5–8 · 100 kg" for the working sets, plus "+2 warm-up" when there are warm-ups. */
export function summariseSets(sets: readonly PlannedSet[]): string {
  const working = sets.filter((set) => set.kind !== "warmup");
  const warmups = sets.length - working.length;
  const first = working[0];
  const parts: string[] = [];
  if (first) {
    const target =
      first.reps_min !== undefined && first.reps_max !== undefined
        ? range(first.reps_min, first.reps_max)
        : first.duration_s !== undefined
          ? `${first.duration_s} s`
          : first.distance_m !== undefined
            ? `${first.distance_m} m`
            : first.floors !== undefined
              ? `${first.floors} floors`
              : first.steps !== undefined
                ? `${first.steps} steps`
                : null;
    parts.push(target === null ? `${working.length} sets` : `${working.length} × ${target}`);
    if (first.weight_kg !== undefined) parts.push(`${first.weight_kg} kg`);
  }
  if (warmups > 0) parts.push(`+${warmups} warm-up`);
  return parts.join(" · ");
}
