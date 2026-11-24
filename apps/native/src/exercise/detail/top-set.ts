import { isCounted, type ExerciseType, type LoggedSet } from "@workspace/shared";

type TopSetInput = Pick<
  LoggedSet,
  | "exercise_id"
  | "kind"
  | "completed_at"
  | "warmup_counted"
  | "weight_kg"
  | "reps"
  | "duration_s"
  | "distance_m"
  | "floors"
  | "steps"
>;

/** The numbers a set is ranked by, most important first, for each exercise type. */
const RANKING: Record<ExerciseType, readonly ((set: TopSetInput) => number)[]> = {
  weight_reps: [(s) => s.weight_kg ?? 0, (s) => s.reps ?? 0],
  bodyweight_weighted_reps: [(s) => s.weight_kg ?? 0, (s) => s.reps ?? 0],
  short_distance_weight: [(s) => s.weight_kg ?? 0, (s) => s.distance_m ?? 0],
  reps_only: [(s) => s.reps ?? 0],
  bodyweight_reps: [(s) => s.reps ?? 0],
  bodyweight_assisted_reps: [(s) => s.reps ?? 0],
  duration: [(s) => s.duration_s ?? 0],
  distance_duration: [(s) => s.distance_m ?? 0, (s) => s.duration_s ?? 0],
  floors_duration: [(s) => s.floors ?? 0, (s) => s.duration_s ?? 0],
  steps_duration: [(s) => s.steps ?? 0, (s) => s.duration_s ?? 0],
};

/**
 * The top set of an exercise among `sets`: the heaviest for weight and reps (ties by reps), the
 * most reps for rep-only types, otherwise the longest. Only Counted sets are looked at; null when
 * the exercise has none.
 */
export function topSet<Set extends TopSetInput>(
  sets: readonly Set[],
  exerciseId: string,
  type: ExerciseType,
): Set | null {
  const ranking = RANKING[type];
  let best: Set | null = null;
  for (const set of sets) {
    if (set.exercise_id !== exerciseId || !isCounted(set)) continue;
    if (best === null) {
      best = set;
      continue;
    }
    for (const key of ranking) {
      const difference = key(set) - key(best);
      if (difference === 0) continue;
      if (difference > 0) best = set;
      break;
    }
  }
  return best;
}
