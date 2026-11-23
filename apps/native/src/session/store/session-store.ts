import {
  sessionTotals,
  supersetPlaces,
  type EffortScale,
  type SetField,
  type SupersetPlace,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { createStore, type StoreApi } from "zustand/vanilla";

import { blocksOf, firstUnfinished, highlightOf, nextAfter, type Block } from "../logging/blocks";
import type { CellRef } from "../logging/keypad-entry";
import { NO_PENDING, settled, withPending, type Pending } from "../logging/optimistic";
import { loggedSetsOf } from "../logging/set-values";
import { shareSession } from "../screen/share-session";

import {
  deriveExercises,
  type DeriveInputs,
  type ExerciseCache,
  type ExerciseView,
} from "./derive";
import { deepEqual } from "./equal";

/** Where a set sits: its exercise, its place in it. */
export type Found = { exercise: SessionExerciseDetail; set: SessionSetDetail; index: number };

/** A refused tick and the cells that lack a value. */
export type Refusal = { setId: string; fields: readonly SetField[] };

/** What the rows draw that is not in the Session or its lookups. */
export type SessionUi = {
  readOnly: boolean;
  inlineTimer: boolean;
  effortScale: EffortScale;
  countWarmups: boolean;
};

/** The numbers the header shows. */
export type SessionStats = {
  sets: number;
  volume: number;
  ticked: number;
  unticked: number;
};

type Base = {
  stored: SessionDetail;
  pending: Pending;
  restTarget: SessionDetail["rest"] | undefined;
  inputs: DeriveInputs;
  ui: SessionUi;
  focusedExerciseId: string | null;
};

type Derived = {
  /** The Session as shown: the stored one with the changes the database has not echoed yet. */
  session: SessionDetail;
  exerciseIds: readonly string[];
  exercises: ReadonlyMap<string, SessionExerciseDetail>;
  views: ReadonlyMap<string, ExerciseView>;
  setsById: ReadonlyMap<string, SessionSetDetail>;
  found: ReadonlyMap<string, Found>;
  places: ReadonlyMap<string, SupersetPlace>;
  blocks: readonly Block<SessionExerciseDetail>[];
  stats: SessionStats;
  currentSetId: string | null;
  cache: ReadonlyMap<string, ExerciseCache>;
};

/** The keypad: the cell being edited and what is typed in it. `fresh` means the next key replaces it. */
export type EntryState = { cell: CellRef | null; raw: string; fresh: boolean };

export type SessionState = Base &
  Derived &
  EntryState & {
    refusal: Refusal | null;
    setStored: (session: SessionDetail) => void;
    updatePending: (update: (current: Pending) => Pending) => void;
    setRestTarget: (rest: SessionDetail["rest"] | undefined) => void;
    setInputs: (inputs: DeriveInputs) => void;
    setUi: (ui: SessionUi) => void;
    setFocusedExercise: (exerciseId: string | null) => void;
    setEntry: (next: { cell: CellRef; raw: string; fresh: boolean } | null) => void;
    setRefusal: (refusal: Refusal | null) => void;
  };

export type SessionStore = StoreApi<SessionState>;

export const DEFAULT_INPUTS: DeriveInputs = {
  previous: new Map(),
  historyFailed: false,
  previousSource: "same_workout",
  unit: "kg",
  unitName: "kg",
  display: { durationFormat: "clock", distanceUnit: "m" },
  weightIncrementKg: null,
  lighterWeeks: [],
  lighter: false,
  bodyweightKg: null,
  stallVersion: 0,
  stallMemory: () => ({ dismissed: false, applied: false }),
  chipTexts: (sets) => sets.map((_set, index) => String(index + 1)),
};

export const DEFAULT_UI: SessionUi = {
  readOnly: false,
  inlineTimer: true,
  effortScale: "rpe",
  countWarmups: false,
};

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

function compute(base: Base, prev: (Base & Derived) | null): Derived {
  const sessionChanged =
    !prev ||
    prev.stored !== base.stored ||
    prev.pending !== base.pending ||
    prev.restTarget !== base.restTarget;
  let session = prev?.session ?? base.stored;
  if (sessionChanged) {
    const merged = withPending(base.stored, base.pending);
    session = shareSession(
      prev?.session ?? null,
      base.restTarget === undefined ? merged : { ...merged, rest: base.restTarget },
    );
  }

  const exercisesChanged = !prev || session.exercises !== prev.session.exercises;
  const exerciseIds = (() => {
    if (prev && !exercisesChanged) return prev.exerciseIds;
    const ids = session.exercises.map((entry) => entry.id);
    return prev && sameIds(prev.exerciseIds, ids) ? prev.exerciseIds : ids;
  })();
  const exercises =
    prev && !exercisesChanged
      ? prev.exercises
      : new Map(session.exercises.map((entry) => [entry.id, entry] as const));
  const setsById =
    prev && !exercisesChanged
      ? prev.setsById
      : new Map(
          session.exercises.flatMap((entry) => entry.sets.map((set) => [set.id, set] as const)),
        );
  const found =
    prev && !exercisesChanged
      ? prev.found
      : new Map(
          session.exercises.flatMap((exercise) =>
            exercise.sets.map((set, index) => [set.id, { exercise, set, index }] as const),
          ),
        );
  const places =
    prev && !exercisesChanged
      ? prev.places
      : (() => {
          const list = supersetPlaces(session.exercises, (entry) => entry.supersetGroup);
          return new Map(
            session.exercises.map((entry, index) => [entry.id, list[index] ?? "none"] as const),
          );
        })();
  const blocks = prev && !exercisesChanged ? prev.blocks : blocksOf(session.exercises);
  const stats = (() => {
    if (
      prev &&
      !exercisesChanged &&
      prev.ui.countWarmups === base.ui.countWarmups &&
      prev.inputs.bodyweightKg === base.inputs.bodyweightKg
    )
      return prev.stats;
    const totals = sessionTotals(
      loggedSetsOf(session, base.ui.countWarmups),
      base.inputs.bodyweightKg,
    );
    let ticked = 0;
    let unticked = 0;
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.completedAt === null) unticked += 1;
        else ticked += 1;
      }
    }
    const next = { sets: totals.sets, volume: totals.volume, ticked, unticked };
    return prev && deepEqual(prev.stats, next) ? prev.stats : next;
  })();

  const finished = session.finishedAt !== null;
  const cache =
    prev &&
    !exercisesChanged &&
    prev.inputs === base.inputs &&
    (prev.session.finishedAt !== null) === finished &&
    prev.session.workoutId === session.workoutId
      ? prev.cache
      : deriveExercises(
          session.exercises,
          base.inputs,
          { finished, workoutId: session.workoutId },
          prev?.cache ?? new Map(),
        );
  const views =
    prev &&
    (cache === prev.cache ||
      (prev.views.size === cache.size &&
        [...cache].every(([id, entry]) => prev.views.get(id) === entry.view)))
      ? prev.views
      : new Map([...cache].map(([id, entry]) => [id, entry.view] as const));

  const focusedBlock = blocks.find((block) =>
    block.members.some((member) => member.id === base.focusedExerciseId),
  );
  const nextBlock = base.focusedExerciseId
    ? nextAfter(blocks, base.focusedExerciseId)
    : firstUnfinished(blocks);
  const currentSetId =
    base.ui.readOnly || session.finishedAt !== null
      ? null
      : (focusedBlock && highlightOf(focusedBlock)?.setId) ||
        (nextBlock && highlightOf(nextBlock)?.setId) ||
        null;

  return {
    session,
    exerciseIds,
    exercises,
    views,
    setsById,
    found,
    places,
    blocks,
    stats,
    currentSetId,
    cache,
  };
}

/**
 * The store of one live Session, made when its screen opens and dropped with it. It holds the
 * Session as shown (the database's copy with the pending ticks on top), the per-exercise views
 * (Previous, Ghost values, labels) and the keypad's cell and draft. The watches stay the source of
 * truth: the screen feeds them in with `setStored` and `setInputs`; rows read what they draw with
 * narrow selectors, so changing one set redraws that set's row and its exercise, not the list.
 */
export function createSessionStore(
  stored: SessionDetail,
  inputs: DeriveInputs = DEFAULT_INPUTS,
  ui: SessionUi = DEFAULT_UI,
): SessionStore {
  const base: Base = {
    stored,
    pending: NO_PENDING,
    restTarget: undefined,
    inputs,
    ui,
    focusedExerciseId: null,
  };
  return createStore<SessionState>()((set, get) => {
    /** Applies a change to the inputs and recomputes what depends on them. */
    const apply = (patch: Partial<Base>) => {
      const before = get();
      const next: Base = { ...before, ...patch };
      const derived = compute(next, before);
      const closes =
        before.cell !== null && (!derived.found.has(before.cell.setId) || next.ui.readOnly);
      set({
        ...patch,
        ...derived,
        ...(closes ? { cell: null, raw: "", fresh: true } : {}),
      });
    };
    return {
      ...base,
      ...compute(base, null),
      cell: null,
      raw: "",
      fresh: true,
      refusal: null,
      setStored: (session) => {
        if (get().stored !== session)
          apply({ stored: session, pending: settled(get().pending, session) });
      },
      updatePending: (update) => {
        const next = update(get().pending);
        if (next !== get().pending) apply({ pending: settled(next, get().stored) });
      },
      setRestTarget: (rest) => {
        if (get().restTarget !== rest) apply({ restTarget: rest });
      },
      setInputs: (next) => {
        if (get().inputs !== next) apply({ inputs: next });
      },
      setUi: (next) => {
        const current = get().ui;
        if (!deepEqual(current, next)) apply({ ui: next });
      },
      setFocusedExercise: (exerciseId) => {
        if (get().focusedExerciseId !== exerciseId) apply({ focusedExerciseId: exerciseId });
      },
      setEntry: (next) =>
        set(
          next
            ? { cell: next.cell, raw: next.raw, fresh: next.fresh }
            : { cell: null, raw: "", fresh: true },
        ),
      setRefusal: (refusal) => set({ refusal }),
    };
  });
}
