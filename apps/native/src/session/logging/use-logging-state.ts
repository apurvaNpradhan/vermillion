import {
  SET_FIELDS,
  MAX_WEIGHT_KG,
  activeLighterWeek,
  progresses,
  resolveExerciseUnit,
  snapshotModifiers,
  type PreviousSource,
  type EffortScale,
  type ExerciseBests,
  type Ghosts,
  type SetKind,
  type SetField,
  type LighterPeriod,
  type WeightUnit,
  incrementInUnit,
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
import type { SessionState, SessionStore } from "@/session/store/session-store";

import {
  applyKey,
  stepLabel,
  stepValue,
  textOfValue,
  valueOfText,
  type EntryField,
  type StepContext,
} from "@/platform/ui/keypad-entry";
import { cellOrder, nextCell, type CellRef } from "./keypad-entry";
import type { PreviousSets } from "./use-previous-sets";
import type { useOptimisticSession } from "./use-optimistic-session";
import { dueTimers, timerTarget, timerView } from "@/session/timer/duration-timer";
import { hasRequiredSetValues, historySettled } from "./history-gate";
import { usePrescriptionRevisions } from "./use-prescription-revisions";
import { useEntryGuard } from "./use-entry-guard";
import { previewTick, savedSession, settleTick } from "./optimistic";
import { tickedSetIsRecord, type createRecordBestsCache } from "./record-on-tick";
import { restAfterTick } from "@/session/rest/rest-rules";
import type { GymLoads, LoggedLoad } from "@/gym";
import { loggedSetOf, patchFor, previousPatch, valueOfSet, type DisplayUnits } from "./set-values";

type Actions = Pick<
  ReturnType<typeof useOptimisticSession>,
  | "tick"
  | "savePrescription"
  | "reviseSnapshot"
  | "untick"
  | "updateValues"
  | "addExtraSet"
  | "awaitWrites"
>;

type GuardField = "weight" | "reps";
type ManualValues = Partial<Record<GuardField, number | null>>;

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
  prescriptionReady,
  unit,
  display,
  effortScale,
  bodyweightKg,
  weightIncrementKg,
  weightIncrementUnit,
  gym,
  lighterWeeks: rawLighterWeeks,
  recordAlerts,
  previousSource,
  countWarmups,
  readOnly,
  actions,
  onRestStarted,
  onLoggedLoad,
  sessionGymId,
}: {
  store: SessionStore;
  editor: boolean;
  previous: PreviousSets;
  recordBests: ReturnType<typeof createRecordBestsCache> | null;
  historyReady: boolean;
  /** The Previous lookup failed: sets with their own values can still be ticked. */
  historyFailed: boolean;
  prescriptionReady: boolean;
  unit: WeightUnit;
  display: DisplayUnits;
  effortScale: EffortScale;
  bodyweightKg: number | null;
  weightIncrementKg: number | null;
  weightIncrementUnit?: WeightUnit | null;
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
  sessionGymId: string | null;
  /** A working set was ticked: what it was logged at and what the Ghost value offered. */
  onLoggedLoad?: (input: LoggedLoad) => void;
}) {
  const { t } = useTranslation();
  const sound = useSoundCues();

  // ---- Feeding the store: what Previous, Ghost values and the row labels depend on ----
  const stallVersion = useStallVersion();
  const lighterWeeks = useStableValue(rawLighterWeeks);
  const shownDisplay = useStableValue(display);
  const unitNames = useMemo(
    () => ({ kg: t("training__unit_kg"), lb: t("training__unit_lb") }),
    [t],
  );
  const lighter = activeLighterWeek(lighterWeeks, new Date()) !== null;
  const phase = useStore(store, (state) => state.session.phase);
  const testEntryId = useStore(store, (state) => state.session.phaseModifiers?.test_entry_id);
  // How much of the last load this Session's phase asks for (0.9 in a Deload, 1 otherwise).
  const phaseLoad = useStore(store, (state) =>
    state.session.phase === null
      ? 1
      : snapshotModifiers(state.session.phase, state.session.phaseModifiers).modifiers.load,
  );
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
      prescriptionReady,
      previousSource,
      unit,
      unitNames,
      display: shownDisplay,
      weightIncrementKg,
      weightIncrementUnit,
      gym,
      sessionGymId,
      lighterWeeks,
      lighter,
      phaseLoad,
      phase,
      testEntryId,
      bodyweightKg,
      stallVersion,
      stallMemory,
      chipTexts: badges,
    }),
    [
      previous,
      historyFailed,
      prescriptionReady,
      previousSource,
      unit,
      unitNames,
      shownDisplay,
      weightIncrementKg,
      weightIncrementUnit,
      gym,
      sessionGymId,
      lighterWeeks,
      lighter,
      phaseLoad,
      phase,
      testEntryId,
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
  const savePrescription = actions.savePrescription;
  const capturing = useRef(new Set<string>());
  useEffect(() => {
    if (readOnly || !historyReady || !prescriptionReady) return;
    for (const [id, view] of views) {
      if (!view.prescriptionDraft || capturing.current.has(id)) continue;
      capturing.current.add(id);
      void savePrescription(id, view.prescriptionDraft).finally(() => capturing.current.delete(id));
    }
  }, [readOnly, historyReady, prescriptionReady, views, savePrescription]);
  usePrescriptionRevisions({
    store,
    views,
    readOnly,
    ready: historyReady && prescriptionReady,
    revise: actions.reviseSnapshot,
  });
  const exercises = useStore(store, (state) => state.session.exercises);
  const finished = useStore(store, (state) => state.session.finishedAt !== null);
  const currentSetId = useStore(store, (state) => state.currentSetId);
  const cell = useStore(store, (state) => state.cell);
  const refusal = useStore(store, (state) => (editor ? null : state.refusal));
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
    (next: Parameters<ReturnType<SessionStore["getState"]>["setEntry"]>[0]) =>
      store.getState().setEntry(next),
    [store],
  );
  const contextFor = useCallback(
    (exercise: SessionExerciseDetail | undefined): StepContext => {
      const equipment = exercise?.exercise?.equipment ?? "other";
      const exerciseUnit = resolveExerciseUnit(unit, exercise?.unit);
      return {
        unit: exerciseUnit,
        equipment,
        grid: exercise ? gym.gridFor(exercise.exerciseId, equipment, exercise.unit) : null,
        incrementKg: incrementInUnit(weightIncrementKg, weightIncrementUnit ?? unit, exerciseUnit),
      };
    },
    [unit, gym, weightIncrementKg, weightIncrementUnit],
  );
  const readEntry = useCallback(() => {
    const { cell, raw, fresh, draftValue, found } = store.getState();
    if (!cell) return null;
    const at = found.get(cell.setId);
    if (!at) return null;
    return { cell, raw, fresh, draftValue, set: at.set, context: contextFor(at.exercise) };
  }, [store, contextFor]);
  const writer = useCoalescedWriter((patch: { setId: string; values: SetPatch }) =>
    actions.updateValues(patch.setId, patch.values),
  );
  const activeSetId = cell?.setId ?? null;
  const activeExercise = activeSetId === null ? undefined : found.get(activeSetId)?.exercise;
  const activeUnit = resolveExerciseUnit(unit, activeExercise?.unit);
  const priorEntry = useRef<{ cell: CellRef | null; unit: WeightUnit }>({ cell: null, unit });

  /** Saves what is typed now, for a cell that is about to be left. */
  const { flush } = writer;
  useLayoutEffect(() => {
    const last = priorEntry.current;
    priorEntry.current = { cell, unit: activeUnit };
    // The queued write already holds kilograms. Close the old unit's draft if sync changes it.
    if (cell?.field === "weight" && cell === last.cell && activeUnit !== last.unit) {
      void flush();
      setEntry(null);
    }
  }, [cell, activeUnit, flush, setEntry]);
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

  // "Check this set". A live Session asks when a set is ticked; a finished one saves each edit as
  // it is typed, so leaving the cell is when the edit is looked at.
  const sessionId = useStore(store, (state) => state.session.id);
  const guard = useEntryGuard(previous, unit, sessionId);
  const askGuard = guard.ask;
  const manualValues = useRef(new Map<string, ManualValues>());
  const initialCellValue = useRef<number | null>(null);
  const openCellRef = useRef<(setId: string, field: EntryField) => void>(() => undefined);
  const applySwap = useCallback(
    async (setId: string, weightKg: number, reps: number) => {
      if (weightKg > MAX_WEIGHT_KG) return false;
      if (!(await actions.updateValues(setId, { weight_kg: weightKg, reps }))) return false;
      manualValues.current.delete(setId);
      return true;
    },
    [actions.updateValues],
  );
  const reviewLeft = useCallback(
    (proceed: () => void = () => undefined) => {
      const state = store.getState();
      const { cell, fresh, draftValue } = state;
      if (
        state.session.finishedAt === null ||
        !cell ||
        fresh ||
        draftValue === initialCellValue.current
      )
        return false;
      const { setId, field } = cell;
      if (field !== "weight" && field !== "reps") return false;
      const at = state.found.get(setId);
      const manual = manualValues.current.get(setId);
      if (!at || !manual || manual[field] !== draftValue) return false;
      return askGuard({
        setId,
        exercise: at.exercise,
        kind: at.set.kind,
        typed: {
          weightKg:
            field === "weight"
              ? draftValue
              : manual.weight === at.set.weightKg
                ? at.set.weightKg
                : null,
          reps: field === "reps" ? draftValue : manual.reps === at.set.reps ? at.set.reps : null,
        },
        editedField: field,
        suggestedKg: null,
        proceed,
        change: (changed) => openCellRef.current(setId, changed),
        swap: async (weightKg, reps) => {
          if (await applySwap(setId, weightKg, reps)) proceed();
        },
      });
    },
    [store, askGuard, applySwap],
  );

  const openCell = useCallback(
    (setId: string, field: EntryField) => {
      if (readOnly) return;
      const cell = store.getState().cell;
      if (cell?.setId === setId && cell.field === field) return;
      reviewLeft();
      flush();
      const at = store.getState().found.get(setId);
      if (!at) return;
      initialCellValue.current = valueOfSet(at.set, field);
      setEntry({
        cell: { setId, field },
        raw: textOfValue(
          field,
          initialCellValue.current,
          resolveExerciseUnit(unit, at.exercise.unit),
        ),
        fresh: true,
      });
    },
    [readOnly, reviewLeft, flush, store, unit, setEntry],
  );
  useLayoutEffect(() => {
    openCellRef.current = openCell;
  }, [openCell]);
  const closeKeypad = useCallback(() => {
    reviewLeft();
    flush();
    setEntry(null);
  }, [reviewLeft, flush, setEntry]);
  const reviewBeforeLeaving = useCallback(
    (leave: () => void) => {
      const asked = reviewLeft(leave);
      void flush();
      setEntry(null);
      if (!asked) leave();
    },
    [reviewLeft, flush, setEntry],
  );

  const forgetFilledValues = useCallback((setId: string, patch: SetPatch) => {
    const values = manualValues.current.get(setId);
    if (!values) return;
    if ("weight_kg" in patch) delete values.weight;
    if ("reps" in patch) delete values.reps;
  }, []);

  /** Writes a cell's value (null clears it); a ticked set must keep its values. */
  const commit = useCallback(
    (target: CellRef, value: number | null, manual = true) => {
      const state = store.getState();
      const at = state.found.get(target.setId);
      if (!at || (value === null && at.set.completedAt !== null)) return;
      if (target.field === "weight" || target.field === "reps") {
        const values = manualValues.current.get(target.setId) ?? {};
        if (manual) values[target.field] = value;
        else delete values[target.field];
        manualValues.current.set(target.setId, values);
      }
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
        current.fresh && key === "backspace"
          ? ""
          : applyKey(current.cell.field, base, key, current.context.unit);
      if (text === current.raw && !current.fresh) return;
      const value = valueOfText(
        current.cell.field,
        text,
        current.context.unit,
        current.context.grid?.capKg,
      );
      setEntry({ cell: current.cell, raw: text, fresh: false, draftValue: value });
      commit(current.cell, value);
    },
    [commit, readEntry, setEntry],
  );

  /** Puts a whole value into the cell being edited (the plate calculator's Use). */
  const putValue = useCallback(
    (value: number) => {
      const current = readEntry();
      if (!current || current.cell.field !== "weight") return;
      const kg = Math.min(value, current.context.grid?.capKg ?? value);
      setEntry({
        cell: current.cell,
        raw: textOfValue("weight", kg, current.context.unit),
        fresh: false,
        draftValue: kg,
      });
      commit(current.cell, kg, false);
    },
    [commit, readEntry, setEntry],
  );

  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = readEntry();
      if (!current) return;
      const field = current.cell.field;
      const typed = current.fresh ? valueOfSet(current.set, field) : current.draftValue;
      const ghost = lookupGhosts(current.cell.setId)[field] ?? null;
      const stepped = stepValue(field, typed, ghost, direction, current.context);
      setEntry({
        cell: current.cell,
        raw: textOfValue(field, stepped, current.context.unit),
        fresh: false,
        draftValue: stepped,
      });
      commit(current.cell, stepped);
    },
    [lookupGhosts, commit, readEntry, setEntry],
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

  const stepText = (state: SessionState, direction: 1 | -1): string => {
    const { cell } = state;
    if (!cell) return "";
    const at = state.found.get(cell.setId);
    if (!at) return "";
    const current = state.fresh ? valueOfSet(at.set, cell.field) : state.draftValue;
    const ghost = state.views.get(at.exercise.id)?.rows.get(cell.setId)?.ghosts[cell.field] ?? null;
    return stepLabel(cell.field, current, ghost, direction, contextFor(at.exercise));
  };

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
        loaded:
          Boolean(at.exercise.prescription) ||
          (prescriptionReady && previous.has(at.exercise.exerciseId)),
        failed: historyFailed,
      });
      const latest = at.set;
      if (!settled && !hasRequiredSetValues(at.exercise.type, (field) => valueOfSet(latest, field)))
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
      if (onLoggedLoad && state.session.finishedAt === null && progresses(at.set.kind)) {
        const loggedReps = latest.reps ?? used.reps ?? null;
        onLoggedLoad({
          sessionId: state.session.id,
          exerciseId: at.exercise.exerciseId,
          equipment: at.exercise.exercise?.equipment ?? "other",
          suggestedKg,
          loggedKg,
          outcome: at.exercise.prescription?.sets.find(({ id }) => id === setId)?.outcome ?? null,
          workoutExerciseId: at.exercise.sourceWorkoutExerciseId,
          sets: at.exercise.sets.map((set) => ({
            kind: set.kind,
            completed: set.id === setId || set.completedAt !== null,
            reps: set.id === setId ? loggedReps : set.reps,
            target: set.target,
            suggestedReps:
              at.exercise.prescription?.sets.find(({ id }) => id === set.id)?.ghosts.reps ?? null,
          })),
        });
      }

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
      prescriptionReady,
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
      const state = store.getState();
      const at = state.found.get(setId);
      const proceed = () => {
        const current = store.getState();
        const latest = current.found.get(setId);
        if (
          !at ||
          !latest ||
          at.set.completedAt !== latest.set.completedAt ||
          state.session.finishedAt !== current.session.finishedAt
        )
          return;
        current.setRefusal(null);
        if (editor) current.setFocusedExercise(latest.exercise.id);
        if (latest.set.completedAt !== null) {
          if (editor) return actions.untick(setId);
          return;
        }
        return tickWith(setId, lookupGhosts(setId), undefined, savingEdits);
      };
      const reviewedEdit = reviewLeft(() => void proceed());
      setEntry(null);
      if (reviewedEdit) return;
      if (!at) return;
      const manual = manualValues.current.get(setId);
      if (state.session.finishedAt !== null || at.set.completedAt !== null || !manual) {
        await proceed();
        return;
      }
      // Flushing applies the optimistic edit synchronously. A remote or app-filled value
      // must not inherit that manual edit.
      const asked = askGuard({
        setId,
        exercise: at.exercise,
        kind: at.set.kind,
        typed: {
          weightKg: manual.weight === at.set.weightKg ? at.set.weightKg : null,
          reps: manual.reps === at.set.reps ? at.set.reps : null,
        },
        suggestedKg: lookupGhosts(setId).weight ?? null,
        proceed: () => void proceed(),
        change: (field) => openCell(setId, field),
        swap: async (weightKg, reps) => {
          if (await applySwap(setId, weightKg, reps)) {
            await tickWith(setId, lookupGhosts(setId));
          }
        },
      });
      if (!asked) await proceed();
    },
    [
      readOnly,
      flush,
      actions,
      lookupGhosts,
      tickWith,
      store,
      setEntry,
      editor,
      askGuard,
      openCell,
      reviewLeft,
      applySwap,
    ],
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
      void flush();
      if (store.getState().cell?.setId === setId) setEntry(null);
      const patch = previousPatch(
        source,
        at.exercise.type,
        at.exercise.logEffort && at.set.kind !== "warmup",
      );
      if (Object.keys(patch).length === 0) return;
      forgetFilledValues(setId, patch);
      const wrote = await actions.updateValues(setId, patch);
      const current = store.getState();
      if (wrote && current.refusal?.setId === setId) current.setRefusal(null);
    },
    [lookupPrevious, store, readOnly, setEntry, flush, actions, forgetFilledValues],
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
              value: typing.draftValue,
            }
          : null;
      flush();
      const at = store.getState().found.get(setId);
      if (!at) return;
      const updates = copySetUpdates(at.exercise, setId, mode, lookupPrevious(setId), draft);
      await Promise.all(
        updates.map(({ id, patch }) => {
          forgetFilledValues(id, patch);
          return actions.updateValues(id, patch);
        }),
      );
      store.getState().setRefusal(null);
    },
    [readOnly, flush, store, lookupPrevious, actions, readEntry, forgetFilledValues],
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
    readTypedValue: () => {
      const current = readEntry();
      return current && !current.fresh ? current.draftValue : undefined;
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
    /** The "Check this set" dialog; the screen renders it once. */
    guardDialog: guard.dialog,
    reviewBeforeLeaving,
    /** Whether typed values still wait to be written (the keypad coalesces them). */
    editsPending: writer.busy,
  };
}
