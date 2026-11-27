import {
  finiteOutcome,
  gridCapInUnit,
  setBasis,
  type Ghosts,
  type PrescriptionDraft,
  type Prescribed,
  type Progression,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { ghostsOf, previousForSuggestion } from "./set-values";

export function capGhostWeight(ghosts: Ghosts, capKg: number | null): Ghosts {
  if (capKg === null || ghosts.weight == null) return ghosts;
  return ghosts.weight > capKg ? { ...ghosts, weight: capKg } : ghosts;
}

/** The Ghost values of one set: the snapshot's if the Session captured one, else the suggestion's. */
export function loggingGhosts(
  exercise: SessionExerciseDetail,
  index: number,
  prescribed: Pick<Prescribed, "settings" | "history" | "progression">,
) {
  const set = exercise.sets[index];
  const saved = exercise.prescription?.sets.find(({ id }) => id === set?.id);
  const { settings, history, progression } = prescribed;
  const capKg = gridCapInUnit(settings.grid ?? null, settings.weightUnit);
  if (saved) return set?.completedAt !== null ? saved.ghosts : capGhostWeight(saved.ghosts, capKg);
  return set
    ? capGhostWeight(
        ghostsOf(
          exercise.type,
          // A hint is derived from a baseline: never from a Test or Deload week's lighter sets.
          previousForSuggestion(history, settings, exercise.sets, index, set.target, true),
          set.target,
          exercise.logEffort,
          progression?.sets[index],
          exercise.repeated,
        ),
        capKg,
      )
    : {};
}

/** What the exercise's sets are now, for comparing with its snapshot ({@link staleSets}). */
export function currentSetsOf(exercise: SessionExerciseDetail) {
  return exercise.sets.map((set) => ({
    id: set.id,
    basis: setBasis(set.kind, set.target),
    completed: set.completedAt !== null,
  }));
}

/**
 * The snapshot to capture for an exercise: what each set is suggested, the reason and cap, the
 * Session gym it was made for, and what each target was (so a later edit can be told apart).
 */
export function prescriptionDraft(
  exercise: SessionExerciseDetail,
  suggestion: Progression | null,
  capKg: number | null,
  ghostsFor: (index: number) => Ghosts,
  gymId: string | null,
): PrescriptionDraft | null {
  const sets = exercise.sets.map(({ id, kind, target }, index) => ({
    id,
    ghosts: ghostsFor(index),
    // A rule must never hand the snapshot a number its schema refuses: that drops the capture.
    outcome: finiteOutcome(suggestion?.outcomes[index] ?? null),
    basis: setBasis(kind, target),
  }));
  if (!sets.some(({ ghosts }) => Object.values(ghosts).some((value) => value != null))) return null;
  return {
    exerciseId: exercise.exerciseId,
    reason: suggestion?.reason ?? null,
    incrementKg: suggestion?.incrementKg ?? 0,
    breakDays: suggestion?.breakDays ?? null,
    capKg,
    ...(suggestion?.evidence ? { evidence: suggestion.evidence } : {}),
    gymId,
    sets,
  };
}
