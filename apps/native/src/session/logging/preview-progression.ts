import {
  addsLoad,
  formatLoad,
  type SessionHistory,
  type SetKind,
  type SetOutcome,
} from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";

import {
  loggingHistory,
  plannedSuggestion,
  type SuggestionSettings,
} from "../../platform/training/workout-suggestion";
import { ghostsOf, ordinalOf, previousOfRow } from "./set-values";

type PreviewSet = { reps: number; weight: string | null };
type Change = {
  kind: SetKind;
  number: number;
  last: PreviewSet;
  today: PreviewSet;
  outcome: SetOutcome;
};

/** Compare the live suggestion with the same Previous cell the completed set grid shows. */
export function previewProgression(
  entry: WorkoutExerciseDetail,
  history: readonly SessionHistory[],
  settings: SuggestionSettings,
  now = new Date(),
) {
  const exercise = entry.exercise;
  if (!exercise || history.length === 0) return null;
  const type = exercise.exerciseType;
  const suggestion = plannedSuggestion(
    entry.sets,
    history,
    { type, equipment: exercise.equipment, progressionPerSet: exercise.progressionPerSet },
    settings,
    now,
  );
  if (!suggestion) return null;
  const loaded = type === "weight_reps" || addsLoad(type);
  const displayWeight = (kg: number | null | undefined) =>
    loaded && kg != null ? formatLoad(kg, settings.weightUnit, type) : null;
  const baseline = loggingHistory(history, exercise.equipment, settings);
  const changes: Change[] = [];
  for (const [index, target] of entry.sets.entries()) {
    const next = suggestion.sets[index];
    const outcome = suggestion.outcomes[index];
    if (!next || !outcome) continue;
    const previous = previousOfRow(baseline, entry.sets, index);
    if (!previous || previous.reps == null || previous.exercise_type !== type) continue;
    // The hint comes from a baseline Session, as in the set grid.
    const ghost = ghostsOf(
      type,
      previousOfRow(baseline, entry.sets, index, true),
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
