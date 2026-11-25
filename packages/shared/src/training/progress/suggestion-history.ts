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

/** The most recent complete entries with this prescription, newest first. */
export function fixedPrescriptionHistory<Session extends { sets: readonly LoggedSet[] }>(
  history: readonly Session[],
  prescription: readonly PlannedSet[],
): Session[] {
  if (!prescription.some((target) => usesFixedPrescription(prescription, target))) return [];
  return history.filter(({ sets }) => {
    const completed = sets.filter((set) => set.completed_at !== null);
    return (
      completed.length === prescription.length &&
      prescription.every((target, index) => {
        const set = completed[index];
        const before = set?.target;
        return (
          before != null &&
          set?.kind === target.kind &&
          before.kind === target.kind &&
          before.reps_min === target.reps_min &&
          (before.reps_max ?? before.reps_min) === (target.reps_max ?? target.reps_min) &&
          before.effort_min === target.effort_min &&
          before.effort_max === target.effort_max &&
          before.weight_kg === target.weight_kg
        );
      })
    );
  });
}

function isFixedPrescription(target: PlannedSet): boolean {
  const reps = target.reps_min;
  return (
    reps !== undefined &&
    reps === (target.reps_max ?? reps) &&
    (target.kind === "working" || target.kind === "top" || target.kind === "backoff")
  );
}

/** A kind moves as a group only when all of its sets use fixed reps. */
export function usesFixedPrescription(prescription: readonly PlannedSet[], target: PlannedSet) {
  return (
    isFixedPrescription(target) &&
    prescription.every((set) => set.kind !== target.kind || isFixedPrescription(set))
  );
}
