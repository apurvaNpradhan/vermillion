import { WARMUP_REST_SECONDS, type PlannedSet } from "@workspace/shared";

/** Time under load assumed for one set. */
export const SET_SECONDS = 40;
const ROUND_TO_MINUTES = 5;

type Estimable = { sets: readonly PlannedSet[]; restSeconds: number | null };

/** Sets × (40 s + rest); a warm-up set rests the fixed short value. */
export function estimateSeconds(exercises: readonly Estimable[]): number {
  let total = 0;
  for (const { sets, restSeconds } of exercises) {
    for (const set of sets) {
      total += SET_SECONDS + (set.kind === "warmup" ? WARMUP_REST_SECONDS : (restSeconds ?? 0));
    }
  }
  return total;
}

/** The estimate for display ("~55 min"), to the nearest 5 minutes; 0 when there are no sets. */
export function estimateMinutes(exercises: readonly Estimable[]): number {
  const seconds = estimateSeconds(exercises);
  if (seconds === 0) return 0;
  return Math.max(ROUND_TO_MINUTES, Math.round(seconds / 60 / ROUND_TO_MINUTES) * ROUND_TO_MINUTES);
}
