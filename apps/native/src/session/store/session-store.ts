import {
  sessionTotals,
  supersetPlaces,
  type EffortScale,
  type SetField,
  type SupersetPlace,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  expandedWith,
  expandedWithout,
  initialExpanded,
  memberIds,
  reconcileExpanded,
} from "../logging/accordion";
import {
  blockOf,
  blocksOf,
  firstUnfinished,
  highlightOf,
  isBlockDone,
  nextAfter,
  type Block,
} from "../logging/blocks";
import type { CellRef } from "../logging/keypad-entry";
import {
  NO_PENDING,
  savedSession,
  settled,
  withPending,
  type Pending,
} from "../logging/optimistic";
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
  effortScale: EffortScale;
  countWarmups: boolean;
  recordAlerts: boolean;
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
  focusedExerciseId: string | null;
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

/** A request to scroll an exercise into view; a new `nonce` is a new request. */
export type ScrollRequest = { exerciseId: string; nonce: number };

export type SessionState = Base &
  Derived &
  EntryState & {
    refusal: Refusal | null;
    /** The exercises that are open (in memory only: a new screen starts from the first unfinished). */
    expanded: ReadonlySet<string>;
    scrollRequest: ScrollRequest | null;
    /**
     * The sets this screen found to be records, each with the `completedAt` it was ticked at: a set
     * that is unticked and ticked again no longer matches, so its mark ends with the tick.
     */
    records: ReadonlyMap<string, string>;
    markRecord: (setId: string, completedAt: string) => void;
    clearRecord: (setId: string) => void;
    toggleExpanded: (exerciseId: string) => void;
    advanceAfterTick: (setId: string, completedAt: string) => void;
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

/** Whether a set shows its "PR" chip: it is ticked, at the tick that was found to be a record. */
export function showsRecord(
  state: Pick<SessionState, "records" | "setsById" | "ui">,
  setId: string,
): boolean {
  const marked = state.records.get(setId);
  return (
    state.ui.recordAlerts &&
    marked !== undefined &&
    marked === state.setsById.get(setId)?.completedAt
  );
}

export const DEFAULT_INPUTS: DeriveInputs = {
  previous: new Map(),
  historyFailed: false,
  previousSource: "same_workout",
  unit: "kg",
  unitName: "kg",
  display: { durationFormat: "clock", distanceUnit: "m" },
  weightIncrementKg: null,
  gym: {
    gymId: null,
    gridFor: () => null,
    settingFor: () => undefined,
    rangesFor: () => [],
    unavailableEquipment: [],
    hasEquipment: () => true,
  },
  lighterWeeks: [],
  lighter: false,
  bodyweightKg: null,
  stallVersion: 0,
  stallMemory: () => ({ dismissed: false, applied: false }),
  chipTexts: (sets) => sets.map((_set, index) => String(index + 1)),
};

export const DEFAULT_UI: SessionUi = {
  readOnly: false,
  effortScale: "rpe",
  countWarmups: false,
  recordAlerts: true,
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

  const focus = base.focusedExerciseId;
  const focusedExerciseId =
    focus !== null &&
    exercises.has(focus) &&
    exercises.get(focus)?.exerciseId === prev?.exercises.get(focus)?.exerciseId
      ? focus
      : null;
  const focusedBlock = focusedExerciseId ? blockOf(blocks, focusedExerciseId) : undefined;
  const nextBlock = focusedExerciseId
    ? nextAfter(blocks, focusedExerciseId)
    : firstUnfinished(blocks);
  const currentSetId =
    base.ui.readOnly || finished
      ? null
      : (focusedBlock && highlightOf(focusedBlock)?.setId) ||
        (nextBlock && highlightOf(nextBlock)?.setId) ||
        null;

  return {
    focusedExerciseId,
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
    const first = compute(base, null);
    /** Applies a change to the inputs and recomputes what depends on them. */
    const apply = (patch: Partial<Base>) => {
      const before = get();
      const next: Base = { ...before, ...patch };
      const derived = compute(next, before);
      const sameExercise = (id: string) => {
        const current = derived.exercises.get(id);
        return current !== undefined && current.exerciseId === before.exercises.get(id)?.exerciseId;
      };
      const expanded =
        derived.exerciseIds === before.exerciseIds &&
        derived.session.exercises.every(
          (entry) => entry.supersetGroup === before.exercises.get(entry.id)?.supersetGroup,
        )
          ? before.expanded
          : reconcileExpanded(before.blocks, derived.blocks, before.expanded);
      const canShowSet = (setId: string) => {
        const exercise = derived.found.get(setId)?.exercise;
        return (
          exercise !== undefined &&
          exercise.id === before.found.get(setId)?.exercise.id &&
          sameExercise(exercise.id) &&
          expanded.has(exercise.id)
        );
      };
      const closes = before.cell !== null && (next.ui.readOnly || !canShowSet(before.cell.setId));
      const clearRefusal =
        before.refusal !== null && (next.ui.readOnly || !canShowSet(before.refusal.setId));
      const scroll = before.scrollRequest;
      set({
        ...patch,
        ...derived,
        expanded,
        ...(scroll && (!expanded.has(scroll.exerciseId) || !sameExercise(scroll.exerciseId))
          ? { scrollRequest: null }
          : {}),
        ...(closes ? { cell: null, raw: "", fresh: true } : {}),
        ...(clearRefusal ? { refusal: null } : {}),
      });
    };
    const updateExpanded = (
      expanded: ReadonlySet<string>,
      patch?: Pick<SessionState, "focusedExerciseId" | "currentSetId" | "scrollRequest">,
    ) => {
      const state = get();
      const isHidden = (setId: string) => !expanded.has(state.found.get(setId)?.exercise.id ?? "");
      set({
        expanded,
        ...(state.cell && isHidden(state.cell.setId) ? { cell: null, raw: "", fresh: true } : {}),
        ...(state.refusal && isHidden(state.refusal.setId) ? { refusal: null } : {}),
        ...(state.scrollRequest && !expanded.has(state.scrollRequest.exerciseId)
          ? { scrollRequest: null }
          : {}),
        ...patch,
      });
    };
    return {
      ...base,
      ...first,
      expanded: initialExpanded(first.blocks),
      scrollRequest: null,
      records: new Map(),
      markRecord: (setId, completedAt) => {
        const state = get();
        if (!state.ui.recordAlerts || state.records.get(setId) === completedAt) return;
        const saved = savedSession(state);
        if (
          saved.exercises.some((entry) =>
            entry.sets.some((row) => row.id === setId && row.completedAt === completedAt),
          )
        ) {
          set({ records: new Map(state.records).set(setId, completedAt) });
        }
      },
      clearRecord: (setId) => {
        if (!get().records.has(setId)) return;
        const records = new Map(get().records);
        records.delete(setId);
        set({ records });
      },
      toggleExpanded: (exerciseId) => {
        const { blocks, expanded } = get();
        const block = blockOf(blocks, exerciseId);
        if (!block) return;
        const ids = memberIds(block);
        updateExpanded(
          expanded.has(exerciseId) ? expandedWithout(expanded, ids) : expandedWith(expanded, ids),
        );
      },
      advanceAfterTick: (setId, completedAt) => {
        const state = get();
        const at = state.found.get(setId);
        if (
          !at ||
          at.set.completedAt !== completedAt ||
          state.ui.readOnly ||
          state.session.finishedAt !== null ||
          !state.expanded.has(at.exercise.id)
        )
          return;
        const block = blockOf(state.blocks, at.exercise.id);
        if (!block || !isBlockDone(block)) return;
        // Other ticks can still be in the write queue. Advance only when all sets are saved.
        const savedBlock = blockOf(blocksOf(savedSession(state).exercises), at.exercise.id);
        if (!savedBlock || !isBlockDone(savedBlock)) return;
        const target = nextAfter(state.blocks, block.id);
        const closed = expandedWithout(state.expanded, memberIds(block));
        const current = target && highlightOf(target);
        updateExpanded(
          target ? expandedWith(closed, memberIds(target)) : closed,
          target && current
            ? {
                focusedExerciseId: current.exerciseId,
                currentSetId: current.setId,
                scrollRequest: {
                  exerciseId: target.id,
                  nonce: (state.scrollRequest?.nonce ?? 0) + 1,
                },
              }
            : undefined,
        );
      },
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
      setEntry: (next) => {
        if (!next) {
          set({ cell: null, raw: "", fresh: true });
          return;
        }
        const state = get();
        const at = state.found.get(next.cell.setId);
        const block = at && blockOf(state.blocks, at.exercise.id);
        if (!block || state.ui.readOnly) return;
        set({ ...next, expanded: expandedWith(state.expanded, memberIds(block)) });
      },
      setRefusal: (refusal) => set({ refusal }),
    };
  });
}
