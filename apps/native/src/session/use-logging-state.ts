import {
  SET_FIELDS,
  suggestNext,
  supersetPlaces,
  type EffortScale,
  type Ghosts,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type {
  SessionDetail,
  SessionExerciseDetail,
  SessionSetDetail,
  SetPatch,
} from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { haptic } from "@/platform/haptics";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { useCoalescedWriter } from "@/training";

import { useSoundCues } from "./use-sound-cues";
import { useStableHandler } from "./use-stable-handler";

import { blocksOf, firstUnfinished, isBlockDone, nextAfter, type Block } from "./blocks";
import {
  applyKey,
  cellOrder,
  displayOfText,
  nextCell,
  stepOf,
  stepValue,
  textOfValue,
  valueOfText,
  type CellRef,
  type EntryField,
} from "./keypad-entry";
import type { PreviousSets } from "./use-previous-sets";
import type { useSessionActions } from "./use-session-actions";
import { dueTimers, timerTarget, timerView } from "./duration-timer";
import { tickedSetIsRecord } from "./record-on-tick";
import { restAfterTick } from "./rest-rules";
import {
  ghostsOf,
  loggedSetsOf,
  patchFor,
  previousOfRow,
  previousPatch,
  valueOfSet,
} from "./set-values";
import type { ActiveEntry, Refusal } from "./components/set-row";

type Actions = Pick<
  ReturnType<typeof useSessionActions>,
  "tick" | "untick" | "updateValues" | "addExtraSet"
>;

/** Where a set sits: its exercise, its place in it. */
type Found = { exercise: SessionExerciseDetail; set: SessionSetDetail; index: number };

/** The cell the keypad is editing and what is typed in it; `fresh` means the next key replaces it. */
type Entry = { cell: CellRef; raw: string; fresh: boolean };

/**
 * Everything the logging screen does that is not drawing: which block of the accordion is open
 * and where it goes next, the keypad's cell and what is typed into it, refused ticks, and the
 * writes. Edits show at once (the draft is the cell's text) and are saved together once typing
 * pauses; moving to another cell, Done and ticking save immediately.
 */
export function useLoggingState({
  session,
  previous,
  historyReady,
  unit,
  effortScale,
  bodyweightKg,
  weightIncrementKg,
  readOnly,
  actions,
  onRestStarted,
}: {
  session: SessionDetail;
  previous: PreviousSets;
  historyReady: boolean;
  unit: WeightUnit;
  effortScale: EffortScale;
  bodyweightKg: number | null;
  weightIncrementKg: number | null;
  readOnly: boolean;
  actions: Actions;
  /** A Rest just started: the first time, the screen asks about notifications. */
  onRestStarted?: () => void;
}) {
  const exercises = session.exercises;
  const blocks = useMemo(() => blocksOf(exercises), [exercises]);
  const places = useMemo(() => {
    const list = supersetPlaces(exercises, (entry) => entry.supersetGroup);
    return new Map(exercises.map((entry, index) => [entry.id, list[index] ?? "none"] as const));
  }, [exercises]);
  const found = useMemo(() => {
    const map = new Map<string, Found>();
    for (const exercise of exercises) {
      exercise.sets.forEach((set, index) => map.set(set.id, { exercise, set, index }));
    }
    return map;
  }, [exercises]);

  // ---- The accordion ----
  const [openBlockId, setOpenBlockId] = useState<string | null | undefined>(undefined);
  const [justCollapsedId, setJustCollapsedId] = useState<string | null>(null);
  const watched = useRef<{ id: string; done: boolean } | null>(null);
  useEffect(() => {
    if (openBlockId === undefined) {
      setOpenBlockId(firstUnfinished(blocks)?.id ?? blocks[0]?.id ?? null);
      return;
    }
    if (openBlockId === null) return;
    const open = blocks.find((block) => block.id === openBlockId);
    if (!open) {
      setOpenBlockId(firstUnfinished(blocks)?.id ?? null);
      return;
    }
    const done = isBlockDone(open);
    const before = watched.current;
    watched.current = { id: open.id, done };
    // Ticking the last set of the open block collapses it and opens the next one that is not done.
    if (before?.id === open.id && !before.done && done) {
      const next = nextAfter(blocks, open.id);
      setJustCollapsedId(open.members.at(-1)?.id ?? null);
      setOpenBlockId(next?.id ?? null);
    }
  }, [blocks, openBlockId]);

  const toggleBlock = useCallback(
    (exerciseId: string) => {
      const block = blocks.find((candidate) =>
        candidate.members.some((member) => member.id === exerciseId),
      );
      if (!block) return;
      setOpenBlockId((current) => (current === block.id ? null : block.id));
      setJustCollapsedId((current) =>
        block.members.some((member) => member.id === current) ? null : current,
      );
    },
    [blocks],
  );

  // ---- Previous and Ghost values ----
  const previousOf = useCallback(
    (setId: string) => {
      const at = found.get(setId);
      return at
        ? previousOfRow(previous.get(at.exercise.exerciseId), at.exercise.sets, at.index)
        : null;
    },
    [found, previous],
  );
  const suggestions = useMemo(
    () =>
      new Map(
        exercises.map((exercise) => [
          exercise.id,
          session.finishedAt !== null || !exercise.sourceWorkoutExerciseId
            ? null
            : suggestNext(
                exercise.sets.map((set) => ({ ...set.target, kind: set.kind })),
                (previous.get(exercise.exerciseId) ?? []).slice(0, 2).map((entry) => entry.sets),
                exercise.type,
                exercise.exercise?.equipment ?? "other",
                { weightUnit: unit, weightIncrementKg },
              ),
        ]),
      ),
    [exercises, previous, session.finishedAt, unit, weightIncrementKg],
  );
  const ghostsFor = useCallback(
    (setId: string): Ghosts => {
      const at = found.get(setId);
      if (!at || !previous.has(at.exercise.exerciseId)) return {};
      return ghostsOf(
        at.exercise.type,
        previousOf(setId),
        at.set.target,
        at.exercise.logEffort,
        suggestions.get(at.exercise.id)?.sets[at.index],
      );
    },
    [found, previousOf, previous, suggestions],
  );

  // ---- The keypad ----
  const [entry, setEntryState] = useState<Entry | null>(null);
  // Keys can arrive faster than renders; the ref is the truth between them, so it is
  // written with every change rather than after the next render.
  const entryRef = useRef(entry);
  const setEntry = useCallback((next: Entry | null) => {
    entryRef.current = next;
    setEntryState(next);
  }, []);
  const writer = useCoalescedWriter((patch: { setId: string; values: SetPatch }) =>
    actions.updateValues(patch.setId, patch.values),
  );
  const activeSetId = entry?.cell.setId ?? null;

  /** Saves what is typed now, for a cell that is about to be left. */
  const flush = useCallback(() => writer.flush(), [writer]);

  const openCell = useCallback(
    (setId: string, field: EntryField) => {
      if (readOnly) return;
      flush();
      const at = found.get(setId);
      if (!at) return;
      setEntry({
        cell: { setId, field },
        raw: textOfValue(field, valueOfSet(at.set, field), unit),
        fresh: true,
      });
    },
    [readOnly, flush, found, unit],
  );
  const closeKeypad = useCallback(() => {
    flush();
    setEntry(null);
  }, [flush]);

  /** Writes a cell's value (null clears it); a ticked set must keep its values. */
  const commit = useCallback(
    (cell: CellRef, value: number | null) => {
      const at = found.get(cell.setId);
      if (!at || (value === null && at.set.completedAt !== null)) return;
      writer.queue({
        setId: cell.setId,
        // Typing a duration ends a running timer; the value is now typed.
        values: {
          ...patchFor(cell.field, value),
          ...(cell.field === "duration" ? { timer_started_at: null } : {}),
        },
      });
    },
    [found, writer],
  );

  const onKey = useCallback(
    (key: KeypadKey) => {
      const current = entryRef.current;
      if (!current) return;
      const base = current.fresh ? "" : current.raw;
      const raw =
        current.fresh && key === "backspace" ? "" : applyKey(current.cell.field, base, key, unit);
      if (raw === current.raw && !current.fresh) return;
      setEntry({ cell: current.cell, raw, fresh: false });
      commit(current.cell, valueOfText(current.cell.field, raw, unit));
    },
    [unit, commit],
  );

  /** Puts a whole value into the cell being edited (the plate calculator's Use). */
  const putValue = useCallback(
    (value: number) => {
      const current = entryRef.current;
      if (!current) return;
      setEntry({
        cell: current.cell,
        raw: textOfValue(current.cell.field, value, unit),
        fresh: false,
      });
      commit(current.cell, value);
    },
    [unit, commit],
  );

  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = entryRef.current;
      if (!current) return;
      const at = found.get(current.cell.setId);
      if (!at) return;
      const field = current.cell.field;
      const typed = current.fresh
        ? valueOfSet(at.set, field)
        : valueOfText(field, current.raw, unit);
      const ghost = ghostsFor(current.cell.setId)[field] ?? null;
      const next = stepValue(field, typed, ghost, direction, {
        unit,
        barbell: at.exercise.exercise?.equipment === "barbell",
      });
      setEntry({ cell: current.cell, raw: textOfValue(field, next, unit), fresh: false });
      commit(current.cell, next);
    },
    [found, unit, ghostsFor, commit],
  );

  const blockOfSet = useCallback(
    (setId: string): Block<SessionExerciseDetail> | undefined => {
      const at = found.get(setId);
      return at
        ? blocks.find((block) => block.members.some((member) => member.id === at.exercise.id))
        : undefined;
    },
    [found, blocks],
  );

  const orderOf = useCallback(
    (block: Block<SessionExerciseDetail>) =>
      cellOrder(
        block.members.map((member) => ({
          id: member.id,
          sets: member.sets.map((set) => ({
            id: set.id,
            fields: SET_FIELDS[member.type],
          })),
        })),
      ),
    [],
  );

  const next = useMemo(() => {
    if (!entry) return null;
    const block = blockOfSet(entry.cell.setId);
    return block ? nextCell(orderOf(block), entry.cell) : null;
  }, [entry, blockOfSet, orderOf]);

  const stepText = useMemo(() => {
    if (!entry) return "";
    const at = found.get(entry.cell.setId);
    return String(
      stepOf(entry.cell.field, { unit, barbell: at?.exercise.exercise?.equipment === "barbell" }),
    );
  }, [entry, found, unit]);

  const onNext = useCallback(() => {
    if (!next) return closeKeypad();
    openCell(next.setId, next.field);
  }, [next, openCell, closeKeypad]);

  // The keypad closes when its set goes away or the Session stops being editable.
  useEffect(() => {
    if (entry && (!found.has(entry.cell.setId) || readOnly)) setEntry(null);
  }, [entry, found, readOnly]);

  // ---- Ticking ----
  const sound = useSoundCues();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const refusals = useRef(0);

  /**
   * Ticks a set with its Ghost values (`ghosts` replaces them, for a timer that fixes the duration).
   * A tick that works buzzes (success for a Record, light otherwise) and starts the Rest the
   * exercise calls for; one that cannot shakes the cells that lack a value. Returns whether it ticked.
   */
  const tickWith = useCallback(
    async (setId: string, ghosts: Ghosts, strong = false): Promise<boolean> => {
      const at = found.get(setId);
      if (!at || !previous.has(at.exercise.exerciseId)) return false;
      const block = blockOfSet(setId);
      // A finished Session being edited has no timers.
      const seconds =
        block && session.finishedAt === null ? restAfterTick(block, at.exercise.id, setId) : null;
      const result = await actions.tick(setId, ghosts, seconds);
      if (!result) return false;
      if (!result.ok) {
        refusals.current += 1;
        setRefusal({ setId, fields: result.missing, nonce: refusals.current });
        haptic.alert();
        sound.play("refused");
        return false;
      }
      if (!result.wrote) return true;
      const ticked = loggedSetsOf(session)
        .filter((set) => set.exercise_id === at.exercise.exerciseId)
        .map((set) =>
          set.id === setId
            ? { ...set, ...result.values, completed_at: new Date().toISOString() }
            : set,
        );
      const record = tickedSetIsRecord({
        history: previous.get(at.exercise.exerciseId) ?? [],
        session: { id: session.id, startedAt: session.startedAt },
        sets: ticked,
        setId,
        bodyweightKg,
      });
      if (record || strong) haptic.success();
      else haptic.tick();
      // A countdown that reached zero is the only `strong` tick.
      sound.playTick({ record, countdown: strong });
      if (result.rest) onRestStarted?.();
      return true;
    },
    [
      found,
      historyReady,
      actions,
      session,
      previous,
      bodyweightKg,
      blockOfSet,
      onRestStarted,
      sound,
    ],
  );

  const onTick = useCallback(
    async (setId: string) => {
      const at = found.get(setId);
      if (!at || readOnly) return;
      flush();
      setEntry(null);
      setRefusal(null);
      if (at.set.completedAt !== null) {
        await actions.untick(setId);
        return;
      }
      await tickWith(setId, ghostsFor(setId));
    },
    [found, readOnly, flush, actions, ghostsFor, tickWith],
  );

  // ---- Duration timers ----
  const onTimer = useCallback(
    async (setId: string) => {
      const at = found.get(setId);
      if (!at || readOnly || session.finishedAt !== null || at.set.completedAt !== null) return;
      flush();
      setEntry(null);
      if (at.set.timerStartedAt === null) {
        await actions.updateValues(setId, { timer_started_at: new Date().toISOString() });
      } else if (timerTarget(at.set) !== null) {
        // A countdown that is stopped early is cancelled, not logged.
        await actions.updateValues(setId, { timer_started_at: null });
      } else {
        // A stopwatch logs what it counted.
        const elapsed = timerView(at.set.timerStartedAt, null, Date.now()).elapsed;
        await tickWith(setId, { ...ghostsFor(setId), duration: Math.max(1, elapsed) });
      }
    },
    [found, readOnly, flush, actions, tickWith, ghostsFor],
  );

  // A countdown that reaches zero ticks its set by itself, also when the app was in the background
  // meanwhile (it is checked again when the app comes back).
  const autoTick = useRef<(id: string, duration: number) => Promise<void>>(async () => undefined);
  useEffect(() => {
    autoTick.current = async (id, duration) => {
      const ticked = await tickWith(id, { ...ghostsFor(id), duration }, true);
      // A set that cannot be ticked (a missing distance) keeps its duration and stops the timer.
      if (!ticked) await actions.updateValues(id, { duration_s: duration, timer_started_at: null });
    };
  });
  const firing = useRef(new Set<string>());
  useEffect(() => {
    if (readOnly || !historyReady) return;
    const run = () => {
      const sets = exercises.flatMap((exercise) => exercise.sets);
      for (const due of dueTimers(sets, Date.now())) {
        if (firing.current.has(due.id)) continue;
        firing.current.add(due.id);
        void autoTick.current(due.id, due.duration).finally(() => firing.current.delete(due.id));
      }
    };
    run();
    const timer = setInterval(run, 1000);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [exercises, readOnly, historyReady]);

  // ---- Previous, kind, add and remove ----
  const onPrevious = useCallback(
    async (setId: string) => {
      const source = previousOf(setId);
      const at = found.get(setId);
      if (!source || !at || readOnly) return;
      flush();
      await actions.updateValues(
        setId,
        previousPatch(source, at.exercise.type, at.exercise.logEffort),
      );
      setRefusal(null);
    },
    [previousOf, found, readOnly, flush, actions],
  );
  const onKindSelected = useCallback(
    (setId: string, kind: SetKind) => void actions.updateValues(setId, { kind }),
    [actions],
  );

  const addSet = useCallback(
    async (exerciseId: string) => {
      const exercise = exercises.find((candidate) => candidate.id === exerciseId);
      if (!exercise || readOnly) return;
      const last = [...exercise.sets].reverse().find((set) => set.kind !== "warmup");
      const added = await actions.addExtraSet(exerciseId, last?.target ?? null);
      if (added) {
        const block = blocks.find((candidate) =>
          candidate.members.some((member) => member.id === exerciseId),
        );
        if (block) setOpenBlockId(block.id);
        setJustCollapsedId(null);
      }
    },
    [exercises, readOnly, actions, blocks],
  );

  // Rows are memoized: hand them handlers that keep their identity across data changes.
  const stableOpenCell = useStableHandler(openCell);
  const stableOnTick = useStableHandler(onTick);
  const stableOnTimer = useStableHandler(onTimer);
  const stableOnPrevious = useStableHandler(onPrevious);
  return {
    historyReadyFor: (exerciseId: string) => previous.has(exerciseId),
    historyReady,
    blocks,
    places,
    // Before the effect settles the first choice, the block it will open is shown open already,
    // so the screen's first frame matches the next one.
    openBlockId:
      openBlockId === undefined
        ? (firstUnfinished(blocks)?.id ?? blocks[0]?.id ?? null)
        : openBlockId,
    justCollapsedId,
    toggleBlock,
    previousOf,
    ghostsFor,
    suggestions,
    unit,
    effortScale,
    // The cell being edited, as the rows draw it.
    entry: useMemo<ActiveEntry | null>(
      () =>
        entry
          ? {
              cell: entry.cell,
              text: displayOfText(entry.cell.field, entry.raw),
            }
          : null,
      [entry],
    ),
    activeSetId,
    activeField: entry?.cell.field ?? null,
    /**
     * What is typed in the cell being edited, or undefined when nothing has been typed yet. The
     * saved set trails it while typing pauses are coalesced into one write.
     */
    typedValue: entry && !entry.fresh ? valueOfText(entry.cell.field, entry.raw, unit) : undefined,
    hasNext: next !== null,
    stepText,
    openCell: stableOpenCell,
    closeKeypad,
    onKey,
    onStep,
    putValue,
    onNext,
    refusal,
    onTick: stableOnTick,
    editingFinished: session.finishedAt !== null,
    onTimer: stableOnTimer,
    onPrevious: stableOnPrevious,
    onKindSelected,
    addSet,
    found,
    flush,
  };
}
