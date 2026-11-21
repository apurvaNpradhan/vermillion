import { exerciseSuggestion } from "./logging-ghosts";
import {
  SET_FIELDS,
  historyForWorkout,
  type PreviousSource,
  activeLighterWeek,
  stalledSessions,
  supersetPlaces,
  type EffortScale,
  type ExerciseBests,
  type Ghosts,
  type SetKind,
  type LighterPeriod,
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

import { stallMemory, useStallVersion } from "@/exercise";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { useCoalescedWriter } from "@/training";

import { copySetUpdates } from "./copy-sets";
import { useSoundCues } from "@/session/settings/use-sound-cues";
import { useStableHandler } from "@/session/shared/use-stable-handler";

import { blocksOf, firstUnfinished, isBlockDone, nextAfter, type Block } from "./blocks";
import {
  applyKey,
  displayOfText,
  stepOf,
  stepValue,
  textOfValue,
  valueOfText,
  type EntryField,
} from "@/platform/ui/keypad-entry";
import { cellOrder, nextCell, type CellRef } from "./keypad-entry";
import type { PreviousSets } from "./use-previous-sets";
import type { useSessionActions } from "@/session/screen/use-session-actions";
import { dueTimers, timerTarget, timerView } from "@/session/timer/duration-timer";
import { historySettled } from "./history-gate";
import { tickedSetIsRecord, type createRecordBestsCache } from "./record-on-tick";
import { restAfterTick } from "@/session/rest/rest-rules";
import {
  ghostsOf,
  loggedSetsOf,
  patchFor,
  previousOfRow,
  previousPatch,
  valueOfSet,
} from "./set-values";
import type { ActiveEntry, Refusal } from "@/session/sets/set-row";

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
/** What an exercise's stalled note needs. */
export type StallInfo = { count: number; latestSessionId: string; applied: boolean };

export function useLoggingState({
  session,
  previous,
  recordBests,
  historyReady,
  historyFailed,
  unit,
  effortScale,
  bodyweightKg,
  weightIncrementKg,
  lighterWeeks,
  recordAlerts,
  previousSource,
  countWarmups,
  readOnly,
  actions,
  onRestStarted,
}: {
  session: SessionDetail;
  previous: PreviousSets;
  recordBests: ReturnType<typeof createRecordBestsCache> | null;
  historyReady: boolean;
  /** The Previous lookup failed: sets with their own values can still be ticked. */
  historyFailed: boolean;
  unit: WeightUnit;
  effortScale: EffortScale;
  bodyweightKg: number | null;
  weightIncrementKg: number | null;
  lighterWeeks: readonly LighterPeriod[];
  /** Whether a new Record shows its on-screen alert (its sound is the milestone sound's). */
  recordAlerts: boolean;
  /** The "Previous values from" setting. */
  previousSource: PreviousSource;
  /** The "Count warm-up sets" setting. */
  countWarmups: boolean;
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
  // With "Same workout" (the default) a Session started from a Workout compares with that
  // Workout's own Sessions first; "Any session" reads them all. Records keep reading the global
  // `previous`.
  const workoutId = previousSource === "same_workout" ? session.workoutId : null;
  const previousByWorkout = useMemo(
    () =>
      new Map([...previous].map(([id, sessions]) => [id, historyForWorkout(sessions, workoutId)])),
    [previous, workoutId],
  );
  const previousOf = useCallback(
    (setId: string) => {
      const at = found.get(setId);
      return at
        ? previousOfRow(previousByWorkout.get(at.exercise.exerciseId), at.exercise.sets, at.index)
        : null;
    },
    [found, previousByWorkout],
  );
  // A lift that has stalled shows one quiet note; applying it suggests 90% for today.
  const stallVersion = useStallVersion();
  const stalls = useMemo(
    () =>
      new Map(
        exercises.flatMap((exercise): [string, StallInfo][] => {
          if (session.finishedAt !== null || !exercise.sourceWorkoutExerciseId) return [];
          const history = previousByWorkout.get(exercise.exerciseId) ?? [];
          const latestSessionId = history[0]?.id ?? null;
          const count = stalledSessions(history, exercise.type, { bodyweightKg, lighterWeeks });
          if (latestSessionId === null || count === 0) return [];
          const memory = stallMemory(exercise.exerciseId, latestSessionId);
          return memory.dismissed && !memory.applied
            ? []
            : [[exercise.id, { count, latestSessionId, applied: memory.applied }]];
        }),
      ),
    // `stallVersion` changes when a note is dismissed or applied: the memory lives on the device.
    [exercises, previousByWorkout, session.finishedAt, bodyweightKg, lighterWeeks, stallVersion],
  );
  const suggestions = useMemo(
    () =>
      new Map(
        exercises.map((exercise) => [
          exercise.id,
          session.finishedAt !== null || !exercise.sourceWorkoutExerciseId
            ? null
            : exerciseSuggestion(exercise, previousByWorkout.get(exercise.exerciseId) ?? [], {
                weightUnit: unit,
                weightIncrementKg,
                lighterWeeks,
                deload: stalls.get(exercise.id)?.applied === true,
              }),
        ]),
      ),
    [
      exercises,
      previousByWorkout,
      session.finishedAt,
      unit,
      weightIncrementKg,
      lighterWeeks,
      stalls,
    ],
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
        at.exercise.repeated,
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
        equipment: at.exercise.exercise?.equipment ?? null,
        incrementKg: weightIncrementKg,
      });
      setEntry({ cell: current.cell, raw: textOfValue(field, next, unit), fresh: false });
      commit(current.cell, next);
    },
    [found, unit, ghostsFor, commit, weightIncrementKg],
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
    (block: Block<SessionExerciseDetail>) => cellOrder(block, (member) => SET_FIELDS[member.type]),
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
      stepOf(entry.cell.field, {
        unit,
        equipment: at?.exercise.exercise?.equipment ?? null,
        incrementKg: weightIncrementKg,
      }),
    );
  }, [entry, found, unit, weightIncrementKg]);

  const onNext = useCallback(() => {
    if (!next) return closeKeypad();
    openCell(next.setId, next.field);
  }, [next, openCell, closeKeypad]);
  // The Timer edits one set: Next stays within it and closes after its last field.
  const nextInSet = next !== null && next.setId === entry?.cell.setId;
  const onNextInSet = useCallback(() => {
    if (!next || next.setId !== entryRef.current?.cell.setId) return closeKeypad();
    openCell(next.setId, next.field);
  }, [next, openCell, closeKeypad]);

  // The keypad closes when its set goes away or the Session stops being editable.
  useEffect(() => {
    if (entry && (!found.has(entry.cell.setId) || readOnly)) setEntry(null);
  }, [entry, found, readOnly]);

  // ---- Ticking ----
  const sound = useSoundCues();
  const { t } = useTranslation();
  const { toast } = useAppToast();
  /** The last set that was ticked, so the screen can follow a superset to its next exercise. */
  const [tickEvent, setTickEvent] = useState<{ setId: string; nonce: number } | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const refusals = useRef(0);

  /**
   * Ticks a set with its Ghost values (`ghosts` replaces them, for a timer that fixes the duration).
   * A tick that works buzzes (success for a Record, light otherwise) and starts the Rest the
   * exercise calls for; one that cannot shakes the cells that lack a value. Returns whether it ticked.
   */
  const tickWith = useCallback(
    async (setId: string, ghosts: Ghosts, expiresAt?: number): Promise<boolean> => {
      const strong = expiresAt !== undefined;
      const at = found.get(setId);
      if (
        !at ||
        !historySettled({ loaded: previous.has(at.exercise.exerciseId), failed: historyFailed })
      ) {
        return false;
      }
      const block = blockOfSet(setId);
      // A finished Session being edited has no timers.
      const seconds =
        block && session.finishedAt === null ? restAfterTick(block, at.exercise.id, setId) : null;
      const result = await actions.tick(setId, ghosts, seconds, expiresAt);
      if (!result) return false;
      if (!result.ok) {
        refusals.current += 1;
        setRefusal({ setId, fields: result.missing, nonce: refusals.current });
        haptic.alert();
        sound.play("refused");
        return false;
      }
      if (!result.wrote) return true;
      const prior =
        countWarmups || at.set.kind !== "warmup" ? recordBests?.get(at.exercise.exerciseId) : null;
      const isRecord = (bests: Map<string, ExerciseBests>) =>
        tickedSetIsRecord({
          bests,
          sets: loggedSetsOf(session, countWarmups)
            .filter((set) => set.exercise_id === at.exercise.exerciseId)
            .map((set) =>
              set.id === setId
                ? {
                    ...set,
                    ...result.values,
                    completed_at: new Date(expiresAt ?? Date.now()).toISOString(),
                  }
                : set,
            ),
          setId,
          bodyweightKg,
        });
      const announce = () => {
        if (recordAlerts) {
          toast.show({
            variant: "success",
            label: t("session__record_alert", { exercise: at.exercise.title }),
          });
        }
      };
      const record = prior?.value ? isRecord(prior.value) : false;
      if (record || strong) haptic.success();
      else haptic.tick();
      if (record) announce();
      setTickEvent((before) => ({ setId, nonce: (before?.nonce ?? 0) + 1 }));
      // A countdown that reached zero is the only `strong` tick.
      sound.playTick({ record, countdown: strong });
      if (result.rest) onRestStarted?.();

      // The first tick for an exercise can precede its bests. Give immediate tick feedback, then
      // play the milestone cue and announce a Record if the history still applies when it arrives.
      if (prior && !prior.value) {
        void prior.ready.then((bests) => {
          if (bests && isRecord(bests)) {
            sound.play("record");
            announce();
          }
        });
      }
      return true;
    },
    [
      found,
      historyFailed,
      actions,
      session,
      previous,
      recordBests,
      bodyweightKg,
      countWarmups,
      blockOfSet,
      onRestStarted,
      sound,
      recordAlerts,
      toast,
      t,
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
  const autoTick = useRef<(timer: ReturnType<typeof dueTimers>[number]) => Promise<void>>(
    async () => undefined,
  );
  useEffect(() => {
    autoTick.current = async ({ id, duration, expiresAt }) => {
      await tickWith(id, { ...ghostsFor(id), duration }, expiresAt);
    };
  });
  const firing = useRef(new Set<string>());
  useEffect(() => {
    if (readOnly || !(historyReady || historyFailed)) return;
    const run = () => {
      const sets = exercises.flatMap((exercise) => exercise.sets);
      for (const due of dueTimers(sets, Date.now())) {
        if (firing.current.has(due.id)) continue;
        firing.current.add(due.id);
        void autoTick.current(due).finally(() => firing.current.delete(due.id));
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
  }, [exercises, readOnly, historyReady, historyFailed]);

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
  const onCopySets = useCallback(
    async (setId: string, mode: "previous" | "remaining") => {
      if (readOnly) return;
      // The flush below saves the keypad's value without waiting, so read it from the draft.
      const typing = entryRef.current;
      const draft =
        typing && !typing.fresh
          ? {
              setId: typing.cell.setId,
              field: typing.cell.field,
              value: valueOfText(typing.cell.field, typing.raw, unit),
            }
          : null;
      flush();
      const at = found.get(setId);
      if (!at) return;
      for (const update of copySetUpdates(at.exercise, setId, mode, previousOf(setId), draft)) {
        await actions.updateValues(update.id, update.patch);
      }
      setRefusal(null);
    },
    [readOnly, flush, found, previousOf, actions, unit],
  );
  const stableOnCopySets = useStableHandler(onCopySets);
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
      return added;
    },
    [exercises, readOnly, actions, blocks],
  );

  // Rows are memoized: hand them handlers that keep their identity across data changes.
  const stableOpenCell = useStableHandler(openCell);
  const stableOnTick = useStableHandler(onTick);
  const stableOnTimer = useStableHandler(onTimer);
  const stableOnPrevious = useStableHandler(onPrevious);
  return {
    historyReadyFor: (exerciseId: string) =>
      historySettled({ loaded: previous.has(exerciseId), failed: historyFailed }),
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
    stalls,
    // A Lighter week halves the suggested sets; the rest stay visible but optional.
    lighter: activeLighterWeek(lighterWeeks, new Date()) !== null,
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
    hasNextInSet: nextInSet,
    onNextInSet,
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
    tickEvent,
    onPrevious: stableOnPrevious,
    onCopySets: stableOnCopySets,
    onKindSelected,
    addSet,
    found,
    flush,
    /** Whether typed values still wait to be written (the keypad coalesces them). */
    editsPending: writer.busy,
  };
}
