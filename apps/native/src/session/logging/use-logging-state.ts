import {
  SET_FIELDS,
  activeLighterWeek,
  type PreviousSource,
  type EffortScale,
  type Equipment,
  type ExerciseBests,
  type Ghosts,
  type SetKind,
  type SetField,
  type LighterPeriod,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionExerciseDetail, SetPatch } from "@workspace/sync";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";

import { stallMemory, useStallVersion } from "@/exercise";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { chipTexts, useCoalescedWriter } from "@/training";

import { copySetUpdates } from "./copy-sets";
import { useSoundCues } from "@/session/settings/use-sound-cues";
import { useStableHandler } from "@/session/shared/use-stable-handler";
import { useStableValue } from "@/session/shared/use-stable-value";
import type { DeriveInputs } from "@/session/store/derive";
import type { SessionStore } from "@/session/store/session-store";

import {
  applyKey,
  stepOf,
  stepValue,
  textOfValue,
  valueOfText,
  type EntryField,
} from "@/platform/ui/keypad-entry";
import { cellOrder, nextCell, type CellRef } from "./keypad-entry";
import type { PreviousSets } from "./use-previous-sets";
import type { useOptimisticSession } from "./use-optimistic-session";
import { dueTimers, timerTarget, timerView } from "@/session/timer/duration-timer";
import { hasRequiredSetValues, historySettled } from "./history-gate";
import { previewTick, savedSession, settleTick } from "./optimistic";
import { tickedSetIsRecord, type createRecordBestsCache } from "./record-on-tick";
import { restAfterTick } from "@/session/rest/rest-rules";
import type { GymLoads } from "@/gym";
import { loggedSetOf, patchFor, previousPatch, valueOfSet, type DisplayUnits } from "./set-values";

type Actions = Pick<
  ReturnType<typeof useOptimisticSession>,
  "tick" | "untick" | "updateValues" | "addExtraSet" | "awaitWrites"
>;

/**
 * Everything the logging screen does that is not drawing: which set to highlight,
 * the keypad's cell and what is typed into it, refused ticks, and the
 * writes. Edits show at once (the draft is the cell's text) and are saved together once typing
 * pauses; moving to another cell, Done and ticking save immediately. The Session, its lookups and
 * the keypad's state live in the Session's store; this holds the handlers, which read the store
 * when an event fires and so keep their identity.
 */
export function useLoggingState({
  store,
  editor,
  previous,
  recordBests,
  historyReady,
  historyFailed,
  unit,
  display,
  effortScale,
  bodyweightKg,
  weightIncrementKg,
  gym,
  lighterWeeks: rawLighterWeeks,
  recordAlerts,
  previousSource,
  countWarmups,
  readOnly,
  actions,
  onRestStarted,
  onLoggedLoad,
}: {
  store: SessionStore;
  editor: boolean;
  previous: PreviousSets;
  recordBests: ReturnType<typeof createRecordBestsCache> | null;
  historyReady: boolean;
  /** The Previous lookup failed: sets with their own values can still be ticked. */
  historyFailed: boolean;
  unit: WeightUnit;
  display: DisplayUnits;
  effortScale: EffortScale;
  bodyweightKg: number | null;
  weightIncrementKg: number | null;
  gym: GymLoads;
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
  /** A working set was ticked: what it was logged at and what the Ghost value offered. */
  onLoggedLoad?: (input: {
    sessionId: string;
    exerciseId: string;
    equipment: Equipment;
    suggestedKg: number;
    loggedKg: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const sound = useSoundCues();

  // ---- Feeding the store: what Previous, Ghost values and the row labels depend on ----
  const stallVersion = useStallVersion();
  const lighterWeeks = useStableValue(rawLighterWeeks);
  const shownDisplay = useStableValue(display);
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const lighter = activeLighterWeek(lighterWeeks, new Date()) !== null;
  const badges = useCallback(
    (sets: readonly { kind: SetKind }[]) =>
      chipTexts(sets, {
        working: "",
        warmup: t("training__chip_warmup"),
        drop: t("training__chip_drop"),
        failure: t("training__chip_failure"),
        top: t("training__chip_top"),
        backoff: t("training__chip_backoff"),
        myo: t("training__chip_myo"),
      }),
    [t],
  );
  const inputs = useMemo<DeriveInputs>(
    () => ({
      previous,
      historyFailed,
      previousSource,
      unit,
      unitName,
      display: shownDisplay,
      weightIncrementKg,
      gym,
      lighterWeeks,
      lighter,
      bodyweightKg,
      stallVersion,
      stallMemory,
      chipTexts: badges,
    }),
    [
      previous,
      historyFailed,
      previousSource,
      unit,
      unitName,
      shownDisplay,
      weightIncrementKg,
      gym,
      lighterWeeks,
      lighter,
      bodyweightKg,
      stallVersion,
      badges,
    ],
  );
  useLayoutEffect(() => {
    store.getState().setInputs(inputs);
  }, [store, inputs]);
  useLayoutEffect(() => {
    store.getState().setUi({ readOnly, effortScale, countWarmups, recordAlerts });
  }, [store, readOnly, effortScale, countWarmups, recordAlerts]);

  // What this hook's own render reads. The rows read what they draw straight from the store.
  const found = useStore(store, (state) => state.found);
  const blocks = useStore(store, (state) => state.blocks);
  const places = useStore(store, (state) => state.places);
  const views = useStore(store, (state) => state.views);
  const exercises = useStore(store, (state) => state.session.exercises);
  const finished = useStore(store, (state) => state.session.finishedAt !== null);
  const currentSetId = useStore(store, (state) => state.currentSetId);
  const cell = useStore(store, (state) => state.cell);
  const refusal = useStore(store, (state) => (editor ? null : state.refusal));
  // Keys change the text, not the cell. The sets screen draws the text in the row, so only a
  // screen without rows follows it here.
  const raw = useStore(store, (state) => (editor ? "" : state.raw));
  const fresh = useStore(store, (state) => (editor ? true : state.fresh));

  const previousOf = useCallback(
    (setId: string) => {
      const at = views.get(found.get(setId)?.exercise.id ?? "")?.rows.get(setId);
      return at?.previous ?? null;
    },
    [views, found],
  );
  // Changes with the views: the ramp reads it again when Previous or a suggestion moves.
  const ghostsFor = useCallback(
    (setId: string): Ghosts =>
      views.get(found.get(setId)?.exercise.id ?? "")?.rows.get(setId)?.ghosts ?? {},
    [views, found],
  );
  const lookupPrevious = useCallback(
    (setId: string) => {
      const state = store.getState();
      return (
        state.views.get(state.found.get(setId)?.exercise.id ?? "")?.rows.get(setId)?.previous ??
        null
      );
    },
    [store],
  );
  const lookupGhosts = useCallback(
    (setId: string): Ghosts => {
      const state = store.getState();
      return (
        state.views.get(state.found.get(setId)?.exercise.id ?? "")?.rows.get(setId)?.ghosts ?? {}
      );
    },
    [store],
  );

  // ---- The keypad ----
  const setEntry = useCallback(
    (next: { cell: CellRef; raw: string; fresh: boolean } | null) =>
      store.getState().setEntry(next),
    [store],
  );
  const readEntry = useCallback(() => {
    const { cell: current, raw: text, fresh: isFresh } = store.getState();
    return current ? { cell: current, raw: text, fresh: isFresh } : null;
  }, [store]);
  const writer = useCoalescedWriter((patch: { setId: string; values: SetPatch }) =>
    actions.updateValues(patch.setId, patch.values),
  );
  const activeSetId = cell?.setId ?? null;

  /** Saves what is typed now, for a cell that is about to be left. */
  const { flush } = writer;
  const { awaitWrites } = actions;
  const flushWrites = useCallback(async () => {
    await flush();
    await awaitWrites();
    return store.getState().stats;
  }, [flush, awaitWrites, store]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  const openCell = useCallback(
    (setId: string, field: EntryField) => {
      if (readOnly) return;
      flush();
      const at = store.getState().found.get(setId);
      if (!at) return;
      setEntry({
        cell: { setId, field },
        raw: textOfValue(field, valueOfSet(at.set, field), unit),
        fresh: true,
      });
    },
    [readOnly, flush, store, unit, actions, setEntry],
  );
  const closeKeypad = useCallback(() => {
    flush();
    setEntry(null);
  }, [flush, setEntry]);

  /** Writes a cell's value (null clears it); a ticked set must keep its values. */
  const commit = useCallback(
    (target: CellRef, value: number | null) => {
      const state = store.getState();
      const at = state.found.get(target.setId);
      if (!at || (value === null && at.set.completedAt !== null)) return;
      const refusal = state.refusal;
      if (
        value !== null &&
        refusal?.setId === target.setId &&
        refusal.fields.includes(target.field)
      ) {
        const fields = refusal.fields.filter((field) => field !== target.field);
        state.setRefusal(fields.length ? { setId: target.setId, fields } : null);
      }
      writer.queue({
        setId: target.setId,
        // Typing a duration ends a running timer; the value is now typed.
        values: {
          ...patchFor(target.field, value),
          ...(target.field === "duration" ? { timer_started_at: null } : {}),
        },
      });
    },
    [store, writer],
  );

  const onKey = useCallback(
    (key: KeypadKey) => {
      const current = readEntry();
      if (!current) return;
      const base = current.fresh ? "" : current.raw;
      const text =
        current.fresh && key === "backspace" ? "" : applyKey(current.cell.field, base, key, unit);
      if (text === current.raw && !current.fresh) return;
      setEntry({ cell: current.cell, raw: text, fresh: false });
      commit(current.cell, valueOfText(current.cell.field, text, unit));
    },
    [unit, commit, readEntry, setEntry],
  );

  /** Puts a whole value into the cell being edited (the plate calculator's Use). */
  const putValue = useCallback(
    (value: number) => {
      const current = readEntry();
      if (!current) return;
      setEntry({
        cell: current.cell,
        raw: textOfValue(current.cell.field, value, unit),
        fresh: false,
      });
      commit(current.cell, value);
    },
    [unit, commit, readEntry, setEntry],
  );

  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = readEntry();
      if (!current) return;
      const at = store.getState().found.get(current.cell.setId);
      if (!at) return;
      const field = current.cell.field;
      const typed = current.fresh
        ? valueOfSet(at.set, field)
        : valueOfText(field, current.raw, unit);
      const ghost = lookupGhosts(current.cell.setId)[field] ?? null;
      const stepped = stepValue(field, typed, ghost, direction, {
        unit,
        equipment: at.exercise.exercise?.equipment ?? null,
        incrementKg: weightIncrementKg,
      });
      setEntry({ cell: current.cell, raw: textOfValue(field, stepped, unit), fresh: false });
      commit(current.cell, stepped);
    },
    [store, unit, lookupGhosts, commit, weightIncrementKg, readEntry, setEntry],
  );

  const next = useMemo(() => {
    if (!cell) return null;
    const at = found.get(cell.setId);
    const block = at
      ? blocks.find((entry) => entry.members.some((member) => member.id === at.exercise.id))
      : undefined;
    return block
      ? nextCell(
          cellOrder(block, (member) => SET_FIELDS[member.type]),
          cell,
        )
      : null;
  }, [cell, found, blocks]);

  const stepText = useMemo(() => {
    if (!cell) return "";
    const at = found.get(cell.setId);
    return String(
      stepOf(cell.field, {
        unit,
        equipment: at?.exercise.exercise?.equipment ?? null,
        incrementKg: weightIncrementKg,
      }),
    );
  }, [cell, found, unit, weightIncrementKg]);

  const onNext = useCallback(() => {
    if (!next) return closeKeypad();
    openCell(next.setId, next.field);
  }, [next, openCell, closeKeypad]);

  // ---- Ticking ----
  /**
   * Ticks a set with its Ghost values (`ghosts` replaces them, for a timer that fixes the duration).
   * The press answers at once: the check shows, the haptic and the tick sound play, before the write
   * is queued behind the ones in front of it. The Record check waits for the write, since a Record
   * only counts once the set is saved; a write that fails takes the check back and says so, and
   * one that cannot be made (a cell lacks a value) highlights the cells that lack one.
   * Returns whether it ticked.
   */
  const tickWith = useCallback(
    async (
      setId: string,
      ghosts: Ghosts,
      expiresAt?: number,
      savingEdits?: Promise<boolean[]>,
    ): Promise<boolean> => {
      const state = store.getState();
      const strong = expiresAt !== undefined;
      const at = state.found.get(setId);
      if (!at) return false;
      const settled = historySettled({
        loaded: previous.has(at.exercise.exerciseId),
        failed: historyFailed,
      });
      const latest = at.set;
      if (
        !settled &&
        (!editor || !hasRequiredSetValues(at.exercise.type, (field) => valueOfSet(latest, field)))
      )
        return false;
      const block = state.blocks.find((entry) =>
        entry.members.some((member) => member.id === at.exercise.id),
      );
      // A finished Session being edited has no timers.
      const seconds =
        block && state.session.finishedAt === null
          ? restAfterTick(block, at.exercise.id, setId)
          : null;
      // Already ticked (a countdown that ends after a manual tick): nothing to do, nothing to play.
      if (latest.completedAt !== null) return true;
      const used = settled ? ghosts : {};

      const preview = previewTick(
        latest,
        at.exercise.type,
        used,
        new Date(expiresAt ?? Date.now()).toISOString(),
      );
      const refuse = (missing: readonly SetField[]) => {
        const current = store.getState();
        const exercise = current.found.get(setId)?.exercise;
        if (exercise && (!editor || current.expanded.has(exercise.id)))
          current.setRefusal({ setId, fields: missing });
        haptic.alert();
        sound.play("refused");
      };
      if (preview.kind === "refused" && !strong) {
        refuse(preview.missing);
        return false;
      }
      if (!strong) {
        haptic.tick();
        sound.playTick({ record: false, countdown: false });
      }
      const result = await actions.tick(
        setId,
        used,
        seconds,
        preview.kind === "ok" ? preview.change : undefined,
        expiresAt,
        savingEdits,
      );
      const settlement = settleTick(result);
      if (settlement.outcome === "failed") return false;
      if (result && !result.ok) {
        refuse(result.missing);
        return false;
      }
      if (!result || !result.wrote) return true;
      // The database verifies the exact expiry. Another screen may already have logged it.
      if (strong) {
        haptic.success();
        sound.playTick({ record: false, countdown: true });
      }
      if (result.rest && store.getState().session.rest?.startedAt === result.rest.startedAt)
        onRestStarted?.();
      const suggestedKg = used.weight ?? null;
      const loggedKg = latest.weightKg ?? suggestedKg;
      if (
        onLoggedLoad &&
        !editor &&
        at.set.kind === "working" &&
        suggestedKg !== null &&
        loggedKg !== null
      )
        onLoggedLoad({
          sessionId: state.session.id,
          exerciseId: at.exercise.exerciseId,
          equipment: at.exercise.exercise?.equipment ?? "other",
          suggestedKg,
          loggedKg,
        });

      const prior =
        countWarmups || at.set.kind !== "warmup" ? recordBests?.get(at.exercise.exerciseId) : null;
      const isRecord = (bests: Map<string, ExerciseBests>) => {
        const state = store.getState();
        const saved = savedSession(state);
        const exercises = saved.exercises.filter(
          (exercise) => exercise.exerciseId === at.exercise.exerciseId,
        );
        if (
          !exercises.some((exercise) =>
            exercise.sets.some((set) => set.id === setId && set.completedAt === result.completedAt),
          )
        )
          return false;
        return tickedSetIsRecord({
          bests,
          sets: exercises.flatMap((exercise) =>
            exercise.sets.map((set) => loggedSetOf(exercise, set, countWarmups)),
          ),
          setId,
          bodyweightKg,
        });
      };
      const announceRecord = () => {
        sound.play("record");
        // The tick already buzzed; a countdown's one buzz was the success.
        if (!strong) haptic.success();
        store.getState().markRecord(setId, result.completedAt);
      };
      // The first tick for an exercise can precede its bests: the Record shows when they arrive,
      // if the history still applies then.
      if (prior?.value) {
        if (isRecord(prior.value)) announceRecord();
      } else if (prior) {
        void prior.ready.then((bests) => {
          if (bests && isRecord(bests)) announceRecord();
        });
      }
      return true;
    },
    [
      store,
      editor,
      historyFailed,
      actions,
      previous,
      recordBests,
      bodyweightKg,
      countWarmups,
      onRestStarted,
      onLoggedLoad,
      sound,
    ],
  );

  const onTick = useCallback(
    async (setId: string) => {
      if (readOnly) return;
      const savingEdits = flush();
      setEntry(null);
      const state = store.getState();
      const at = state.found.get(setId);
      if (!at) return;
      state.setRefusal(null);
      if (editor) state.setFocusedExercise(at.exercise.id);
      if (at.set.completedAt !== null) {
        if (editor) await actions.untick(setId);
        return;
      }
      await tickWith(setId, lookupGhosts(setId), undefined, savingEdits);
    },
    [readOnly, flush, actions, lookupGhosts, tickWith, store, setEntry, editor],
  );

  // ---- Duration timers ----
  const onTimer = useCallback(
    async (setId: string) => {
      if (readOnly) return;
      const savingEdits = flush();
      const state = store.getState();
      const at = state.found.get(setId);
      if (!at || state.session.finishedAt !== null || at.set.completedAt !== null) return;
      setEntry(null);
      if (at.set.timerStartedAt === null) {
        await actions.updateValues(setId, { timer_started_at: new Date().toISOString() });
      } else if (timerTarget(at.set) !== null) {
        // A countdown that is stopped early is cancelled, not logged.
        await actions.updateValues(setId, { timer_started_at: null });
      } else {
        // A stopwatch logs what it counted.
        const pausedAt = state.session.pausedAt;
        const elapsed = timerView(
          at.set.timerStartedAt,
          null,
          pausedAt === null ? Date.now() : Date.parse(pausedAt),
        ).elapsed;
        await tickWith(
          setId,
          { ...lookupGhosts(setId), duration: Math.max(1, elapsed) },
          undefined,
          savingEdits,
        );
      }
    },
    [store, readOnly, flush, actions, tickWith, lookupGhosts, setEntry],
  );

  // A countdown that reaches zero ticks its set by itself, also when the app was in the background
  // meanwhile (it is checked again when the app comes back).
  const autoTick = useRef<(timer: ReturnType<typeof dueTimers>[number]) => Promise<void>>(
    async () => undefined,
  );
  useEffect(() => {
    autoTick.current = async ({ id, duration, expiresAt }) => {
      await tickWith(id, { ...lookupGhosts(id), duration }, expiresAt, flush());
    };
  });
  const focused = useIsFocused();
  const firing = useRef(new Set<string>());
  useEffect(() => {
    if (!focused || readOnly || finished || !(historyReady || historyFailed)) return;
    const sets = exercises.flatMap((exercise) =>
      exercise.sets.filter((set) => set.timerStartedAt !== null && timerTarget(set) !== null),
    );
    if (sets.length === 0) return;
    const run = () => {
      // A paused workout holds its timers; Resume shifts them by the pause.
      if (store.getState().session.pausedAt !== null) return;
      for (const due of dueTimers(sets, Date.now())) {
        if (firing.current.has(due.id)) continue;
        firing.current.add(due.id);
        void autoTick.current(due).finally(() => firing.current.delete(due.id));
      }
    };
    run();
    const timer = setInterval(run, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [exercises, focused, finished, readOnly, historyReady, historyFailed]);

  // ---- Previous, kind, add and remove ----
  const onPrevious = useCallback(
    async (setId: string) => {
      const source = lookupPrevious(setId);
      const at = store.getState().found.get(setId);
      if (!source || !at || readOnly) return;
      if (store.getState().cell?.setId === setId) closeKeypad();
      else void flush();
      const patch = previousPatch(
        source,
        at.exercise.type,
        at.exercise.logEffort && at.set.kind !== "warmup",
      );
      if (Object.keys(patch).length === 0) return;
      const wrote = await actions.updateValues(setId, patch);
      const current = store.getState();
      if (wrote && current.refusal?.setId === setId) current.setRefusal(null);
    },
    [lookupPrevious, store, readOnly, closeKeypad, flush, actions],
  );
  const onCopySets = useCallback(
    async (setId: string, mode: "previous" | "remaining") => {
      if (readOnly) return;
      // The flush below saves the keypad's value without waiting, so read it from the draft.
      const typing = readEntry();
      const draft =
        typing && !typing.fresh
          ? {
              setId: typing.cell.setId,
              field: typing.cell.field,
              value: valueOfText(typing.cell.field, typing.raw, unit),
            }
          : null;
      flush();
      const at = store.getState().found.get(setId);
      if (!at) return;
      const updates = copySetUpdates(at.exercise, setId, mode, lookupPrevious(setId), draft);
      await Promise.all(updates.map(({ id, patch }) => actions.updateValues(id, patch)));
      store.getState().setRefusal(null);
    },
    [readOnly, flush, store, lookupPrevious, actions, unit, readEntry],
  );
  const onKindSelected = useCallback(
    (setId: string, kind: SetKind) => void actions.updateValues(setId, { kind }),
    [actions],
  );

  const addSet = useCallback(
    async (exerciseId: string) => {
      const exercise: SessionExerciseDetail | undefined = store
        .getState()
        .exercises.get(exerciseId);
      if (!exercise || readOnly) return;
      const last = [...exercise.sets].reverse().find((set) => set.kind !== "warmup");
      return actions.addExtraSet(exerciseId, last?.target ?? null);
    },
    [store, readOnly, actions],
  );

  // Rows are memoized: hand them handlers that keep their identity across data changes.
  const stableOpenCell = useStableHandler(openCell);
  const stableOnTick = useStableHandler(onTick);
  const stableOnTimer = useStableHandler(onTimer);
  const stableOnPrevious = useStableHandler(onPrevious);
  const stableOnCopySets = useStableHandler(onCopySets);
  const stableOnKindSelected = useStableHandler(onKindSelected);
  const stableAddSet = useStableHandler(addSet);
  const stableCloseKeypad = useStableHandler(closeKeypad);
  const stableOnKey = useStableHandler(onKey);
  const stableOnStep = useStableHandler(onStep);
  const stablePutValue = useStableHandler(putValue);
  const stableOnNext = useStableHandler(onNext);
  const entry = useMemo(() => (cell ? { cell } : null), [cell]);
  return {
    historyReady,
    blocks,
    places,
    currentSetId,
    previousOf,
    ghostsFor,
    unit,
    effortScale,
    /** The cell being edited. What is typed into it is drawn by its row, from the store. */
    entry,
    /** A refused tick; only a screen without rows follows it (the rows read it themselves). */
    refusal,
    activeSetId,
    activeField: cell?.field ?? null,
    /**
     * What is typed in the cell being edited, or undefined when nothing has been typed yet. The
     * saved set trails it while typing pauses are coalesced into one write. Only a screen without
     * rows follows it.
     */
    typedValue: cell && !fresh ? valueOfText(cell.field, raw, unit) : undefined,
    readTypedValue: () => {
      const current = readEntry();
      return current && !current.fresh
        ? valueOfText(current.cell.field, current.raw, unit)
        : undefined;
    },
    hasNext: next !== null,
    stepText,
    openCell: stableOpenCell,
    closeKeypad: stableCloseKeypad,
    onKey: stableOnKey,
    onStep: stableOnStep,
    putValue: stablePutValue,
    onNext: stableOnNext,
    onTick: stableOnTick,
    editingFinished: finished,
    onTimer: stableOnTimer,
    onPrevious: stableOnPrevious,
    onCopySets: stableOnCopySets,
    onKindSelected: stableOnKindSelected,
    addSet: stableAddSet,
    found,
    flush,
    flushWrites,
    /** Whether typed values still wait to be written (the keypad coalesces them). */
    editsPending: writer.busy,
  };
}
