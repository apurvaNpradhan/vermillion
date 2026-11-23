import {
  SET_FIELDS,
  historyForWorkout,
  optionalSetIndexes,
  stalledSessions,
  type Ghosts,
  type LighterPeriod,
  type LoggedSet,
  type Progression,
  type PreviousSource,
  type SetField,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type { FinishedSession, SessionExerciseDetail } from "@workspace/sync";

import { allTicked, doneSummary, progressText } from "../finish/summary";
import { copySetUpdates } from "../logging/copy-sets";
import { exerciseSuggestion } from "../logging/logging-ghosts";
import { ghostsOf, previousOfRow, valueOfSet, type DisplayUnits } from "../logging/set-values";

import { deepEqual, keepIfEqual } from "./equal";

/** What an exercise's stalled note needs. */
export type StallInfo = { count: number; latestSessionId: string; applied: boolean };

/** Everything outside the Session that Previous, Ghost values and the row labels depend on. */
export type DeriveInputs = {
  /** The finished Sessions of each exercise, newest first. */
  previous: ReadonlyMap<string, readonly FinishedSession[]>;
  historyFailed: boolean;
  previousSource: PreviousSource;
  unit: WeightUnit;
  unitName: string;
  display: DisplayUnits;
  weightIncrementKg: number | null;
  lighterWeeks: readonly LighterPeriod[];
  /** A Lighter week is running now. */
  lighter: boolean;
  bodyweightKg: number | null;
  /** Changes when a stalled note is dismissed or applied (that memory lives on the device). */
  stallVersion: number;
  /** The device's memory of a stalled note. */
  stallMemory: (
    exerciseId: string,
    latestSessionId: string,
  ) => { dismissed: boolean; applied: boolean };
  /** The badge text of each set: its number, or its kind's letter. */
  chipTexts: (sets: readonly { kind: SetKind }[]) => string[];
};

/** What one row draws besides its set: Previous, Ghost values and its labels. */
export type RowView = {
  previous: LoggedSet | null;
  ghosts: Ghosts;
  badge: string;
  number: number;
  canRemove: boolean;
  canCopyPrevious: boolean;
  canFillRemaining: boolean;
  /** A Lighter week makes this set optional. */
  optional: boolean;
};

/** What an exercise's header and set rows draw, apart from the sets themselves. */
export type ExerciseView = {
  suggestion: Progression | null;
  stall: StallInfo | null;
  /** "2/4". */
  progress: string;
  /** The done summary after the progress; empty while sets remain. */
  summary: string;
  /** Previous values of the exercise have loaded, or their lookup failed. */
  historyReady: boolean;
  setIds: readonly string[];
  rows: ReadonlyMap<string, RowView>;
};

/** What is cached per exercise: the inputs the view was built from, and the view. */
export type ExerciseCache = {
  exercise: SessionExerciseDetail;
  history: readonly FinishedSession[] | undefined;
  inputs: DeriveInputs;
  finished: boolean;
  workoutId: string | null;
  view: ExerciseView;
};

/** The history an exercise compares with: its Workout's own Sessions first, when asked to. */
export function historyOf(
  exercise: SessionExerciseDetail,
  inputs: DeriveInputs,
  workoutId: string | null,
): readonly FinishedSession[] | undefined {
  const all = inputs.previous.get(exercise.exerciseId);
  return all && historyForWorkout(all, inputs.previousSource === "same_workout" ? workoutId : null);
}

function buildView(
  exercise: SessionExerciseDetail,
  rawHistory: readonly FinishedSession[] | undefined,
  inputs: DeriveInputs,
  finished: boolean,
  workoutId: string | null,
  before: ExerciseView | undefined,
): ExerciseView {
  const history = historyOf(exercise, inputs, workoutId);
  const loaded = rawHistory !== undefined;
  const historyReady = loaded || inputs.historyFailed;

  // A lift that has stalled shows one quiet note; applying it suggests 90% for today.
  let stall: StallInfo | null = null;
  if (!finished && exercise.sourceWorkoutExerciseId) {
    const sessions = history ?? [];
    const latestSessionId = sessions[0]?.id ?? null;
    const count = stalledSessions(sessions, exercise.type, {
      bodyweightKg: inputs.bodyweightKg,
      lighterWeeks: inputs.lighterWeeks,
    });
    if (latestSessionId !== null && count > 0) {
      const memory = inputs.stallMemory(exercise.exerciseId, latestSessionId);
      if (!memory.dismissed || memory.applied)
        stall = { count, latestSessionId, applied: memory.applied };
    }
  }
  const suggestion =
    finished || !exercise.sourceWorkoutExerciseId
      ? null
      : exerciseSuggestion(exercise, history ?? [], {
          weightUnit: inputs.unit,
          weightIncrementKg: inputs.weightIncrementKg,
          lighterWeeks: inputs.lighterWeeks,
          deload: stall?.applied === true,
        });

  const fields: readonly SetField[] = SET_FIELDS[exercise.type];
  const showsEffort = exercise.logEffort && fields.includes("reps");
  const kinds = exercise.sets.map((set) => set.kind);
  const optional = inputs.lighter ? optionalSetIndexes(kinds) : new Set<number>();
  const badges = inputs.chipTexts(exercise.sets);
  let lastUnticked = exercise.sets.length - 1;
  while (lastUnticked >= 0 && exercise.sets[lastUnticked]?.completedAt !== null) lastUnticked -= 1;

  const rows = new Map<string, RowView>();
  exercise.sets.forEach((set, index) => {
    const previous = previousOfRow(history, exercise.sets, index);
    const row: RowView = {
      previous,
      ghosts: loaded
        ? ghostsOf(
            exercise.type,
            previous,
            set.target,
            exercise.logEffort,
            suggestion?.sets[index],
            exercise.repeated,
          )
        : {},
      badge: badges[index] ?? String(index + 1),
      number: index + 1,
      canRemove: exercise.sets.length > 1,
      canCopyPrevious: copySetUpdates(exercise, set.id, "previous", previous).length > 0,
      canFillRemaining:
        index < lastUnticked &&
        (fields.some((field) => valueOfSet(set, field) !== null) ||
          (showsEffort && set.rpe !== null)),
      optional: optional.has(index) && set.completedAt === null,
    };
    rows.set(set.id, keepIfEqual(before?.rows.get(set.id), row));
  });

  const setIds = exercise.sets.map((set) => set.id);
  const view: ExerciseView = {
    suggestion: before && deepEqual(before.suggestion, suggestion) ? before.suggestion : suggestion,
    stall: before && deepEqual(before.stall, stall) ? before.stall : stall,
    progress: progressText(exercise.sets),
    summary: allTicked(exercise.sets)
      ? doneSummary(exercise.sets, exercise.type, inputs.unit, inputs.unitName, inputs.display)
      : "",
    historyReady,
    setIds: sameIds(setIds, before?.setIds) ? (before?.setIds ?? setIds) : setIds,
    rows,
  };
  return before && sameView(before, view) ? before : view;
}

function sameIds(a: readonly string[], b: readonly string[] | undefined): boolean {
  return b !== undefined && a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameView(a: ExerciseView, b: ExerciseView): boolean {
  return (
    a.suggestion === b.suggestion &&
    a.stall === b.stall &&
    a.progress === b.progress &&
    a.summary === b.summary &&
    a.historyReady === b.historyReady &&
    a.setIds === b.setIds &&
    a.rows.size === b.rows.size &&
    b.setIds.every((id) => a.rows.get(id) === b.rows.get(id))
  );
}

/**
 * The views of every exercise, rebuilding only an exercise whose sets, history or inputs changed
 * since `cache`. A tick therefore recomputes one exercise, not the Session.
 */
export function deriveExercises(
  exercises: readonly SessionExerciseDetail[],
  inputs: DeriveInputs,
  context: { finished: boolean; workoutId: string | null },
  cache: ReadonlyMap<string, ExerciseCache>,
): Map<string, ExerciseCache> {
  const next = new Map<string, ExerciseCache>();
  for (const exercise of exercises) {
    const raw = inputs.previous.get(exercise.exerciseId);
    const old = cache.get(exercise.id);
    if (
      old &&
      old.exercise === exercise &&
      old.history === raw &&
      old.inputs === inputs &&
      old.finished === context.finished &&
      old.workoutId === context.workoutId
    ) {
      next.set(exercise.id, old);
      continue;
    }
    next.set(exercise.id, {
      exercise,
      history: raw,
      inputs,
      finished: context.finished,
      workoutId: context.workoutId,
      view: buildView(exercise, raw, inputs, context.finished, context.workoutId, old?.view),
    });
  }
  return next;
}
