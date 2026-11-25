import type { PlannedSet } from "../plans/planned-sets";
import type { LoggedSet } from "../logging/logged-set";
import { historyForWorkout } from "../logging/history-for-workout";
import type { ContextSession, SuggestionPlace } from "./suggestion-context";
import { historyForGym, usesGymHistory } from "./gym-history";
import type { PreviousSource } from "../vocabulary/vocabulary";

type HistorySelection = {
  history: readonly ContextSession[];
  workoutHistory: readonly ContextSession[];
  anyWorkout: readonly ContextSession[];
};

const histories = new WeakMap<readonly ContextSession[], Map<string, HistorySelection>>();

/** Split one exercise's sets into its entries in Session exercise order. */
export function exerciseEntries(sets: readonly LoggedSet[]): LoggedSet[][] {
  const rows = new Map<string | undefined, LoggedSet[]>();
  for (const set of sets) {
    const row = rows.get(set.session_exercise_id) ?? [];
    row.push(set);
    rows.set(set.session_exercise_id, row);
  }
  return [...rows.values()];
}

/** Use the source entry across Sessions when known. */
function matchingSets(session: ContextSession, place: SuggestionPlace): readonly LoggedSet[] {
  const entries = exerciseEntries(session.sets);
  const ordinal = entries[place.exerciseOrdinal ?? 0];
  const source = place.sourceWorkoutExerciseId;
  if (source && session.workoutId === place.workoutId) {
    const same = entries.find((row) => row[0]?.source_workout_exercise_id === source);
    if (same) return same;
    if (ordinal?.[0]?.source_workout_exercise_id && (place.duplicateEntry || entries.length > 1))
      return [];
  }
  return ordinal ?? [];
}

/** Match rows and slice history once per immutable watch result and exercise context. */
export function suggestionHistory(
  rawHistory: readonly ContextSession[],
  place: SuggestionPlace,
  source: PreviousSource,
) {
  const gym = usesGymHistory(place.equipment) ? place.gymId : null;
  const key = JSON.stringify([
    place.workoutId,
    place.sourceWorkoutExerciseId,
    place.exerciseOrdinal ?? 0,
    place.duplicateEntry ?? false,
    source,
    gym,
  ]);
  const cache = histories.get(rawHistory) ?? new Map<string, HistorySelection>();
  histories.set(rawHistory, cache);
  const existing = cache.get(key);
  if (existing) return existing;
  const rows = rawHistory.flatMap((session) => {
    const sets = matchingSets(session, place);
    if (sets.length === 0) return [];
    return [sets.length === session.sets.length ? session : { ...session, sets }];
  });
  const workoutHistory = rows.filter((session) => session.workoutId === place.workoutId);
  const baseline = historyForWorkout(rows, source === "same_workout" ? place.workoutId : null);
  const history = historyForGym(baseline, gym, place.equipment);
  const anyWorkout = historyForGym(rows, gym, place.equipment);
  const result = { history, workoutHistory, anyWorkout };
  cache.set(key, result);
  return result;
}

/** The latest matching fixed-rep prescriptions at this ordinal, across Workouts. */
export function fixedPrescriptionSets(
  history: readonly { sets: readonly LoggedSet[] }[],
  target: PlannedSet,
  ordinal: number,
  limit = 1,
): LoggedSet[] {
  const reps = target.reps_min;
  if (reps === undefined || reps !== (target.reps_max ?? reps)) return [];
  const matches: LoggedSet[] = [];
  for (const { sets } of history) {
    const before = sets.filter((set) => set.kind === target.kind && set.completed_at !== null)[
      ordinal
    ];
    if (
      !before?.target ||
      before.target.reps_min !== reps ||
      before.target.reps_max !== reps ||
      before.target.effort_min !== target.effort_min ||
      before.target.effort_max !== target.effort_max
    )
      continue;
    matches.push(before);
    if (matches.length === limit) break;
  }
  return matches;
}
