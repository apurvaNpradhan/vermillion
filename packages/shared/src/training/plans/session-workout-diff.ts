import { generateNKeysBetween } from "fractional-indexing";

import type { PlannedSet } from "./planned-sets";
import type { SetKind } from "../vocabulary/vocabulary";

export type DiffSessionSet = {
  /** The set's position key; with the start snapshot it tells which planned set it was copied from. */
  position?: string;
  kind: SetKind;
  weightKg: number | null;
  completedAt: string | null;
  target: PlannedSet | null;
  /** An untouched auto ramp row: not the user's structure, so never compared or saved. */
  generatedWarmup?: boolean;
};
export type DiffSessionExercise = {
  exerciseId: string;
  sourceWorkoutExerciseId: string | null;
  sets: readonly DiffSessionSet[];
};
export type DiffWorkoutExercise = { id: string; exerciseId: string; sets: readonly PlannedSet[] };

/**
 * Drop untouched generated warm-ups. The ramp replaces the planned warm-ups, so those are
 * stood in for (one per planned warm-up the user has not replaced by touching a warm-up row)
 * and a plain ramp never looks like a removed or added warm-up. A generated warm-up the user
 * ticked or typed into has lost the marker and counts as a real set.
 */
export function withoutGeneratedWarmups<T extends DiffSessionSet>(
  sets: readonly T[],
  planned: readonly PlannedSet[],
): T[] {
  const template = sets.find((set) => set.generatedWarmup === true);
  if (!template) return [...sets];
  const kept = sets.filter((set) => set.generatedWarmup !== true);
  const touched = kept.filter((set) => set.kind === "warmup").length;
  const positions = generateNKeysBetween(null, null, planned.length);
  const standIns = planned.flatMap((plan, index) =>
    plan.kind === "warmup"
      ? [
          {
            ...template,
            position: positions[index],
            kind: plan.kind,
            weightKg: null,
            completedAt: null,
            target: plan,
            generatedWarmup: false,
          },
        ]
      : [],
  );
  return [...standIns.slice(touched), ...kept];
}

/** The exercise and set order a Session copied when it started. */
export function workoutStructureKey(exercises: readonly DiffWorkoutExercise[]): string {
  return JSON.stringify(
    exercises.map(({ id, exerciseId, sets }) => [id, exerciseId, sets.map((set) => set.kind)]),
  );
}

/**
 * Which Session row came from each planned set. The one reconciliation behind both the preview
 * and the save, so they cannot disagree.
 *
 * With a trusted start snapshot (the Workout still has the structure the Session copied), a row
 * is the planned set whose position key it was given at start, so skipped or removed rows never
 * shift the others. Without one, rows can only be matched by kind and ordinal, which is safe
 * only while every planned set of that kind still has its row; otherwise the match is ambiguous
 * and nothing is inferred.
 */
export function matchPlannedSets<T extends DiffSessionSet>(
  planned: readonly PlannedSet[],
  sets: readonly T[],
  snapshotTrusted: boolean,
): { row: T | null; ambiguous: boolean }[] {
  if (snapshotTrusted) {
    const positions = generateNKeysBetween(null, null, planned.length);
    return planned.map((plan, index) => ({
      row:
        sets.find(
          (set) =>
            set.position === positions[index] &&
            set.target !== null &&
            set.target.kind === plan.kind,
        ) ?? null,
      ambiguous: false,
    }));
  }
  return planned.map((plan, index) => {
    const same = planned.filter((other) => other.kind === plan.kind);
    const rows = sets.filter((set) => set.kind === plan.kind);
    const ordinal = planned.slice(0, index).filter((other) => other.kind === plan.kind).length;
    return rows.length === same.length
      ? { row: rows[ordinal] ?? null, ambiguous: false }
      : { row: null, ambiguous: true };
  });
}

/** Each planned set's weight after the Session: the completed row's own, else the plan's. */
export function reconciledTargetWeights(
  planned: readonly PlannedSet[],
  sets: readonly DiffSessionSet[],
  snapshotTrusted: boolean,
): (number | null)[] {
  return matchPlannedSets(planned, sets, snapshotTrusted).map(({ row }, index) => {
    const plan = planned[index];
    const done =
      row && row.completedAt !== null && row.kind === plan?.kind && plan.kind !== "warmup";
    return (done ? row.weightKg : null) ?? plan?.weight_kg ?? null;
  });
}

/** The completed set's weight at the corresponding ordinal of this kind. */
export function loggedTargetWeight(
  sets: readonly { kind: SetKind; weightKg: number | null }[],
  kind: SetKind,
  ordinal = 0,
): number | null {
  if (kind === "warmup") return null;
  return sets.filter((set) => set.kind === kind)[ordinal]?.weightKg ?? null;
}

/** Preserve omitted plan sets when only the completed log is available. */
export function workoutSetKinds(
  planned: readonly PlannedSet[],
  session: readonly { kind: SetKind }[],
  completeStructure: boolean,
): SetKind[] {
  if (completeStructure) return session.map((set) => set.kind);
  const kinds = planned.map((set) => set.kind);
  for (const [index, { kind }] of session.entries()) {
    const ordinal = session.slice(0, index).filter((set) => set.kind === kind).length;
    if (ordinal >= kinds.filter((value) => value === kind).length) kinds.push(kind);
  }
  return kinds;
}

/** A complete structure is captured before the save discards unticked rows. */
export function workoutUpdateEntries<T extends DiffSessionExercise>(
  entries: readonly T[],
  completeStructure: boolean,
): T[] {
  return entries.filter(
    (entry) =>
      (completeStructure && entry.sourceWorkoutExerciseId !== null) ||
      entry.sets.some((set) => set.completedAt !== null),
  );
}

/** Targets change weight only, never reps or effort. */
export function diffSessionAgainstWorkout(
  session: { exercises: readonly DiffSessionExercise[]; workoutStructure?: string | null },
  workout: { exercises: readonly DiffWorkoutExercise[] },
  completeStructure = false,
) {
  const logged = workoutUpdateEntries(
    session.exercises.map((entry) => ({
      ...entry,
      sets: withoutGeneratedWarmups(
        entry.sets,
        workout.exercises.find((item) => item.id === entry.sourceWorkoutExerciseId)?.sets ?? [],
      ),
    })),
    completeStructure,
  );
  const snapshotTrusted =
    session.workoutStructure != null &&
    session.workoutStructure === workoutStructureKey(workout.exercises);
  const observed = completeStructure
    ? workout.exercises
    : workout.exercises.filter((item) =>
        logged.some((entry) => entry.sourceWorkoutExerciseId === item.id),
      );
  const ordered = logged.filter((entry) => entry.sourceWorkoutExerciseId !== null);
  const structure: {
    kind: "added" | "removed" | "replaced" | "reordered" | "sets";
    exerciseId: string;
    beforeSets?: readonly SetKind[];
    afterSets?: readonly SetKind[];
  }[] = [];
  const targets: {
    exerciseId: string;
    workoutExerciseId: string;
    /** Target weights of the planned sets but warm-ups, in order; `after` is aligned with it. */
    before: (number | null)[];
    after: (number | null)[];
  }[] = [];
  for (const [index, entry] of logged.entries()) {
    const source = workout.exercises.find((item) => item.id === entry.sourceWorkoutExerciseId);
    if (!source) structure.push({ kind: "added", exerciseId: entry.exerciseId });
    else if (source.exerciseId !== entry.exerciseId)
      structure.push({ kind: "replaced", exerciseId: entry.exerciseId });
    else {
      const expectedIndex = completeStructure ? index : ordered.indexOf(entry);
      if (observed[expectedIndex]?.id !== source.id)
        structure.push({ kind: "reordered", exerciseId: entry.exerciseId });
      const next = workoutSetKinds(source.sets, entry.sets, completeStructure);
      if (source.sets.length !== next.length || source.sets.some((set, i) => set.kind !== next[i]))
        structure.push({
          kind: "sets",
          exerciseId: entry.exerciseId,
          beforeSets: source.sets.map((set) => set.kind),
          afterSets: next,
        });
      const planned = source.sets.filter((set) => set.kind !== "warmup");
      const before = planned.map((set) => set.weight_kg ?? null);
      const reconciled = reconciledTargetWeights(source.sets, entry.sets, snapshotTrusted);
      const after = source.sets.flatMap((set, i) =>
        set.kind === "warmup" ? [] : [reconciled[i] ?? null],
      );
      if (after.some((weight, i) => weight !== before[i]))
        targets.push({
          exerciseId: entry.exerciseId,
          workoutExerciseId: source.id,
          before,
          after,
        });
    }
  }
  if (completeStructure) {
    for (const entry of workout.exercises)
      if (!logged.some((item) => item.sourceWorkoutExerciseId === entry.id))
        structure.push({ kind: "removed", exerciseId: entry.exerciseId });
  }
  return { structure, targets };
}
