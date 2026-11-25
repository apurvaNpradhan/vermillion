import {
  SET_FIELDS,
  optionalSetIndexes,
  isTestSingle,
  type Phase,
  suggestionContext,
  gridCapInUnit,
  adjustmentLoadsFor,
  type Ghosts,
  type StallInfo,
  type LighterPeriod,
  type LoggedSet,
  type Progression,
  type PrescriptionDraft,
  type PreviousSource,
  type SetField,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type { FinishedSession, SessionExerciseDetail } from "@workspace/sync";
import type { GymLoads } from "@/gym";

import { doneSummary, progressText } from "../finish/summary";
import { copySetUpdates } from "../logging/copy-sets";
import {
  capGhostWeight,
  exerciseSuggestion,
  prescriptionDraft,
  snapshotProgression,
} from "../logging/logging-ghosts";
import {
  ghostsOf,
  previousForSuggestion,
  valueOfSet,
  type DisplayUnits,
} from "../logging/set-values";

import { deepEqual, keepIfEqual } from "./equal";

/** Everything outside the Session that Previous, Ghost values and the row labels depend on. */
export type DeriveInputs = {
  /** The finished Sessions of each exercise, newest first. */
  previous: ReadonlyMap<string, readonly FinishedSession[]>;
  historyFailed: boolean;
  prescriptionReady?: boolean;
  previousSource: PreviousSource;
  unit: WeightUnit;
  unitNames: Readonly<Record<WeightUnit, string>>;
  display: DisplayUnits;
  weightIncrementKg: number | null;
  weightIncrementUnit?: WeightUnit | null;
  /** The active gym supplies equipment, load steps and caps. */
  gym: GymLoads;
  /** The gym selected for this Session determines which history leads. */
  sessionGymId?: string | null;
  lighterWeeks: readonly LighterPeriod[];
  /** A Lighter week is running now. */
  lighter: boolean;
  /** The share of the last load this Session's phase asks for; 1 is as the engine suggests. */
  phaseLoad: number;
  phase?: Phase | null;
  testEntryId?: string;
  bodyweightKg: number | null;
  /** Changes when a stalled note is manually dismissed on this device. */
  stallVersion: number;
  /** The device's memory of a stalled note. */
  stallMemory: (exerciseId: string, latestSessionId: string) => { dismissed: boolean };
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
  capKg: number | null;
};

/** What an exercise's header and set rows draw, apart from the sets themselves. */
export type ExerciseView = {
  suggestion: Progression | null;
  prescriptionDraft: PrescriptionDraft | null;
  stall: StallInfo | null;
  /** "2/4". */
  progress: string;
  /** What the ticked sets logged, after the progress; empty while none is ticked. */
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
  exerciseOrdinal: number;
  duplicateEntry: boolean;
  view: ExerciseView;
};

function buildView(
  exercise: SessionExerciseDetail,
  rawHistory: readonly FinishedSession[] | undefined,
  inputs: DeriveInputs,
  finished: boolean,
  workoutId: string | null,
  exerciseOrdinal: number,
  duplicateEntry: boolean,
  before: ExerciseView | undefined,
): ExerciseView {
  const equipment = exercise.exercise?.equipment ?? "other";
  const loaded = rawHistory !== undefined && inputs.prescriptionReady !== false;
  const historyReady = loaded || inputs.historyFailed || Boolean(exercise.prescription);

  // One builder for every surface: the baseline, the stalled-lift verdict and its applied deload.
  const grid = inputs.gym.gridFor(exercise.exerciseId, equipment, exercise.unit);
  const context = suggestionContext(
    rawHistory ?? [],
    {
      exerciseId: exercise.exerciseId,
      sourceWorkoutExerciseId: exercise.sourceWorkoutExerciseId,
      exerciseOrdinal,
      duplicateEntry,
      type: exercise.type,
      equipment,
      unitOverride: exercise.unit,
      workoutId,
      gymId: inputs.sessionGymId ?? null,
      phaseLoad: inputs.phaseLoad,
      grid,
      // A lift that has stalled shows one quiet note; applying it suggests 90% for today.
      stalls: !finished && Boolean(exercise.sourceWorkoutExerciseId),
      stallDeload: exercise.stallDeload,
      prescription: exercise.sets.map(({ kind, target }) => ({ ...target, kind })),
      testSingle:
        inputs.testEntryId === exercise.sourceWorkoutExerciseId &&
        isTestSingle(
          inputs.phase,
          exercise.sets.map(({ target }) => target),
        ),
    },
    inputs,
  );
  const { unit, stall, history } = context;
  const suggestion =
    finished || !exercise.sourceWorkoutExerciseId || (!loaded && !exercise.prescription)
      ? null
      : exercise.prescription
        ? snapshotProgression(exercise)
        : exerciseSuggestion(exercise, rawHistory ?? [], context.settings);

  const fields: readonly SetField[] = SET_FIELDS[exercise.type];
  const capKg = !finished && fields.includes("weight") ? gridCapInUnit(grid, unit) : null;
  const showsEffort = exercise.logEffort && fields.includes("reps");
  const kinds = exercise.sets.map((set) => set.kind);
  const optional = inputs.lighter ? optionalSetIndexes(kinds) : new Set<number>();
  const badges = inputs.chipTexts(exercise.sets);
  let lastUnticked = exercise.sets.length - 1;
  while (lastUnticked >= 0 && exercise.sets[lastUnticked]?.completedAt !== null) lastUnticked -= 1;

  const rows = new Map<string, RowView>();
  exercise.sets.forEach((set, index) => {
    const previous = previousForSuggestion(
      history,
      context.settings,
      exercise.sets,
      index,
      set.target,
    );
    const hinted = previousForSuggestion(
      history,
      context.settings,
      exercise.sets,
      index,
      set.target,
      true,
    );
    const ghosts = loaded
      ? ghostsOf(
          exercise.type,
          hinted,
          set.target,
          exercise.logEffort,
          suggestion?.sets[index],
          exercise.repeated,
        )
      : {};
    const saved = exercise.prescription?.sets.find(({ id }) => id === set.id);
    const row: RowView = {
      previous,
      ghosts: saved ? saved.ghosts : capGhostWeight(ghosts, capKg),
      badge: badges[index] ?? String(index + 1),
      number: index + 1,
      canRemove: exercise.sets.length > 1,
      canCopyPrevious: copySetUpdates(exercise, set.id, "previous", previous).length > 0,
      canFillRemaining:
        index < lastUnticked &&
        (fields.some((field) => valueOfSet(set, field) !== null) ||
          (showsEffort && set.rpe !== null)),
      optional: optional.has(index) && set.completedAt === null,
      capKg: saved ? (exercise.prescription?.capKg ?? null) : capKg,
    };
    rows.set(set.id, keepIfEqual(before?.rows.get(set.id), row));
  });

  const setIds = exercise.sets.map((set) => set.id);
  const view: ExerciseView = {
    suggestion: before && deepEqual(before.suggestion, suggestion) ? before.suggestion : suggestion,
    prescriptionDraft:
      !finished && loaded && !exercise.prescription
        ? keepIfEqual(
            before?.prescriptionDraft,
            prescriptionDraft(
              exercise,
              suggestion,
              capKg,
              (index) => rows.get(exercise.sets[index]?.id ?? "")?.ghosts ?? {},
              inputs.sessionGymId ?? null,
            ),
          )
        : null,
    stall: before && deepEqual(before.stall, stall) ? before.stall : stall,
    progress: progressText(exercise.sets),
    summary: doneSummary(
      exercise.sets,
      exercise.type,
      unit,
      inputs.unitNames[unit],
      inputs.display,
    ),
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
    a.prescriptionDraft === b.prescriptionDraft &&
    a.stall === b.stall &&
    a.progress === b.progress &&
    a.summary === b.summary &&
    a.historyReady === b.historyReady &&
    a.setIds === b.setIds &&
    a.rows.size === b.rows.size &&
    b.setIds.every((id) => a.rows.get(id) === b.rows.get(id))
  );
}

function sameSettings(a: DeriveInputs, b: DeriveInputs): boolean {
  if (a === b) return true;
  const { previous: _a, chipTexts, stallMemory, gym, ...settings } = a;
  const {
    previous: _b,
    chipTexts: otherChips,
    stallMemory: otherStall,
    gym: otherGym,
    ...other
  } = b;
  return (
    chipTexts === otherChips &&
    stallMemory === otherStall &&
    gym === otherGym &&
    deepEqual(settings, other)
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
  const counts = new Map<string, number>();
  for (const { exerciseId } of exercises) counts.set(exerciseId, (counts.get(exerciseId) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  for (const exercise of exercises) {
    const exerciseOrdinal = ordinals.get(exercise.exerciseId) ?? 0;
    ordinals.set(exercise.exerciseId, exerciseOrdinal + 1);
    const duplicateEntry = (counts.get(exercise.exerciseId) ?? 0) > 1;
    const raw = inputs.previous.get(exercise.exerciseId);
    const old = cache.get(exercise.id);
    if (
      old &&
      old.exercise === exercise &&
      sameSettings(old.inputs, inputs) &&
      (old.history === raw || deepEqual(old.history, raw)) &&
      old.finished === context.finished &&
      old.exerciseOrdinal === exerciseOrdinal &&
      old.duplicateEntry === duplicateEntry &&
      old.workoutId === context.workoutId
    ) {
      next.set(exercise.id, old.inputs === inputs ? old : { ...old, inputs, history: raw });
      continue;
    }
    next.set(exercise.id, {
      exercise,
      history: raw,
      inputs,
      finished: context.finished,
      workoutId: context.workoutId,
      exerciseOrdinal,
      duplicateEntry,
      view: buildView(
        exercise,
        raw,
        inputs,
        context.finished,
        context.workoutId,
        exerciseOrdinal,
        duplicateEntry,
        old?.view,
      ),
    });
  }
  return next;
}

/**
 * The suggestion as it would be made now, for the exercise's sets as they are: for a stall deload
 * that was applied or lifted, and for a snapshot that went stale (the Session gym moved, a target
 * or kind was edited, a set was added).
 */
export function stallPrescription(entry: ExerciseCache, applied: boolean) {
  return buildView(
    { ...entry.exercise, stallDeload: applied, prescription: null },
    entry.history,
    entry.inputs,
    entry.finished,
    entry.workoutId,
    entry.exerciseOrdinal,
    entry.duplicateEntry,
    undefined,
  ).prescriptionDraft;
}

/** What the suggestion would be now for an exercise that keeps its stall deload as it is. */
export function freshPrescription(entry: ExerciseCache) {
  return stallPrescription(entry, entry.exercise.stallDeload === true);
}

/** What a same-day adjustment needs to snap a load the way the suggestion did. */
export function adjustmentLoadsOf({ exercise, inputs }: ExerciseCache) {
  const equipment = exercise.exercise?.equipment ?? "other";
  return adjustmentLoadsFor(
    { equipment, type: exercise.type, unit: exercise.unit },
    inputs,
    inputs.gym.gridFor(exercise.exerciseId, equipment, exercise.unit),
  );
}
