import {
  addsLoad,
  formatLoad,
  isCounted,
  progresses,
  type Prescribed,
  type SessionHistory,
  type SetKind,
  type SetOutcome,
} from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";

import { ghostsOf, ordinalOf, previousForSuggestion } from "./set-values";

type PreviewSet = { reps: number; weight: string | null };
type Change = {
  kind: SetKind;
  number: number;
  last: PreviewSet;
  today: PreviewSet;
  outcome: SetOutcome;
};

/**
 * Compare the prescription with the same Previous cell the completed set grid shows. `history` is
 * the exercise's whole history, for a Test single that has no baseline set of its own.
 */
export function previewProgression(
  entry: WorkoutExerciseDetail,
  prescribed: Pick<Prescribed, "settings" | "history" | "progression">,
  history: readonly SessionHistory[],
) {
  const exercise = entry.exercise;
  if (!exercise || history.length === 0) return null;
  const type = exercise.exerciseType;
  const { settings, progression: suggestion } = prescribed;
  if (!suggestion) return null;
  const loaded = type === "weight_reps" || addsLoad(type);
  const displayWeight = (kg: number | null | undefined) =>
    loaded && kg != null ? formatLoad(kg, settings.weightUnit, type) : null;
  const baseline = prescribed.history;
  const changes: Change[] = [];
  for (const [index, target] of entry.sets.entries()) {
    const next = suggestion.sets[index];
    const outcome = suggestion.outcomes[index];
    if (!next || !outcome) continue;
    const previous =
      previousForSuggestion(baseline, settings, entry.sets, index, target) ??
      (outcome.reason === "test_single"
        ? history
            .find((session) => session.sets.some(isCounted))
            ?.sets.find((set) => isCounted(set) && progresses(set.kind))
        : null);
    if (!previous || previous.reps == null || previous.exercise_type !== type) continue;
    // The hint comes from a baseline Session, as in the set grid.
    const ghost = ghostsOf(
      type,
      previousForSuggestion(baseline, settings, entry.sets, index, target, true),
      target,
      false,
      next,
    );
    if (ghost.reps == null) continue;
    const last = { reps: previous.reps, weight: displayWeight(previous.weight_kg) };
    const today = { reps: ghost.reps, weight: displayWeight(ghost.weight) };
    if (last.reps === today.reps && last.weight === today.weight) continue;
    changes.push({
      kind: target.kind,
      number: ordinalOf(entry.sets, index) + 1,
      last,
      today,
      outcome,
    });
  }
  return changes.length === 0 ? null : { suggestion, changes };
}
