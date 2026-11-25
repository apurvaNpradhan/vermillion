import { isCounted, type LoggedSet } from "../logging/logged-set";
import { exerciseEntries } from "../progress/suggestion-history";
import type { ContextSession, SuggestionAccount } from "../progress/suggestion-context";
import { prescribe } from "./prescribe";

/** The exercises trained this week with a visible stall on at least one of their entries. */
export function stalledExerciseIds(
  thisWeek: readonly Pick<ContextSession, "workoutId" | "gymId" | "sets">[],
  histories: ReadonlyMap<string, readonly ContextSession[]>,
  account: SuggestionAccount,
): string[] {
  const stalled = new Set<string>();
  for (const session of thisWeek) {
    const exercises = new Map<string, LoggedSet[]>();
    for (const set of session.sets) {
      if (stalled.has(set.exercise_id)) continue;
      const sets = exercises.get(set.exercise_id) ?? [];
      sets.push(set);
      exercises.set(set.exercise_id, sets);
    }
    for (const [exerciseId, sets] of exercises) {
      const history = histories.get(exerciseId);
      if (!history) continue;
      const entries = exerciseEntries(sets);
      for (const [exerciseOrdinal, entry] of entries.entries()) {
        const set = entry.find(isCounted);
        if (!set) continue;
        const { stall } = prescribe({
          history,
          account,
          plan: entry.map((row) => ({ ...row.target, kind: row.kind })),
          suggest: false,
          place: {
            exerciseId,
            sourceWorkoutExerciseId: set.source_workout_exercise_id,
            exerciseOrdinal,
            duplicateEntry: entries.length > 1,
            type: set.exercise_type,
            workoutId: session.workoutId,
            gymId: session.gymId ?? null,
            // The stall verdict compares this Workout's history across gyms and ignores load grids.
            equipment: "other",
            grid: null,
            stalls: true,
          },
        });
        // A missed suggestion alone asks to review the target, not for a deload.
        if (stall && !stall.missed) {
          stalled.add(exerciseId);
          break;
        }
      }
    }
  }
  return [...stalled];
}
