import { activeRun, cycleState, runWeek } from "@workspace/shared";
import {
  activateProgram,
  finishRun,
  keepGoing,
  runAgain,
  skipSlot,
  stopProgram,
  unskipSlot,
  watchRunState,
} from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunSlot } from "@workspace/shared";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useProgram } from "./use-program";
import { UNDO_MS, useTrainingWrite } from "@/training/shared/use-training-write";

/**
 * The active Run and what changes it: one local watch, no Program detail. Lists that only mark
 * which Program is active use this, so a list of rows costs one watch, not two per row.
 */
export function useActiveRun() {
  const { t } = useTranslation();
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);
  const { write, writeScope } = useTrainingWrite();
  const state = useLocalWatch(watchRunState);
  const run = activeRun(state.value?.runs ?? []);
  const runId = run?.id ?? null;
  const runProgramId = run?.program_id ?? null;
  const activate = useCallback(
    (id: string) => {
      const apply = () => void write((db) => activateProgram(db, id, writeScope), null);
      if (runProgramId !== null && runProgramId !== id) setPendingProgramId(id);
      else apply();
    },
    [runProgramId, write, writeScope],
  );
  const stop = useCallback(
    () => (runId ? write((db) => stopProgram(db, runId, writeScope), undefined) : undefined),
    [runId, write, writeScope],
  );
  return {
    run,
    runs: state,
    runProgramId,
    loading: state.loading,
    activate,
    stop,
    confirmationProps: {
      isOpen: pendingProgramId !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPendingProgramId(null);
      },
      title: t("run__switch_title"),
      description: t("run__switch_body"),
      cancelLabel: t("common__cancel"),
      confirmLabel: t("run__set_active"),
      onConfirm: () => {
        if (pendingProgramId !== null)
          void write((db) => activateProgram(db, pendingProgramId, writeScope), null);
      },
    },
  };
}

/** The Cycle state of `slots` for the Run `runId`, from what `useActiveRun` watched. */
export function runProgress(
  runs: ReturnType<typeof useActiveRun>["runs"],
  runId: string | null,
  slots: readonly { id: string; workoutId: string | null }[],
) {
  const value = runs.value;
  return value?.runId === runId
    ? cycleState(slots, value.sessions, value.skips)
    : cycleState(slots, []);
}

export function useActiveProgram() {
  const { t } = useTranslation();
  const { write, writeScope } = useTrainingWrite();
  const { toast } = useAppToast();
  const timeZone = useDeviceTimeZone();
  const { run, runs, runProgramId, loading, activate, stop, confirmationProps } = useActiveRun();
  const detail = useProgram(run?.program_id ?? "");
  const program = detail.status === "ready" ? detail.program : null;
  const runId = run?.id ?? null;
  const progress = useMemo(
    () => runProgress(runs, runId, program?.slots ?? []),
    [runs, runId, program?.slots],
  );
  const undoOffer = useRef<{ id: string; day: RunSlot } | null>(null);
  const canUndo = useCallback(
    (day: RunSlot) => day.runId !== runId || day.cycle >= progress.latestCountedCycle,
    [runId, progress.latestCountedCycle],
  );
  const latestCanUndo = useRef(canUndo);
  useEffect(() => {
    latestCanUndo.current = canUndo;
    const offer = undoOffer.current;
    if (offer && !canUndo(offer.day)) toast.hide(offer.id);
  }, [canUndo, toast]);
  const unskip = useCallback(
    (day: RunSlot) =>
      latestCanUndo.current(day) ? write((db) => unskipSlot(db, day, writeScope), false) : false,
    [write, writeScope],
  );
  const skip = useCallback(
    async (day: RunSlot, title: string) => {
      const id = await write((db) => skipSlot(db, day, writeScope), null);
      if (id === null) return;
      const label = t("run__skipped_toast", { title });
      if (!latestCanUndo.current(day)) {
        toast.show({ label });
        return;
      }
      const toastId = toast.show({
        label,
        actionLabel: t("common__undo"),
        duration: UNDO_MS,
        onActionPress: ({ hide }) => {
          hide();
          void unskip(day);
        },
        onHide: () => {
          if (undoOffer.current?.day === day) undoOffer.current = null;
        },
      });
      if (toastId !== null) undoOffer.current = { id: toastId, day };
    },
    [write, writeScope, t, toast, unskip],
  );
  const week = runWeek(run?.started_at ?? null, new Date(), timeZone);
  return {
    run,
    runProgramId,
    program,
    progress,
    week,
    loading,
    // The Run is known and, if there is one, so is its Program: the card can draw at once.
    ready: !loading && (run === null || detail.status !== "loading"),
    activate,
    stop,
    confirmationProps,
    unskip,
    skip,
    finish: () => run && write((db) => finishRun(db, run.id, writeScope), undefined),
    keep: () => run && write((db) => keepGoing(db, run.id, writeScope), undefined),
    again: () => run && write((db) => runAgain(db, run.id, run.program_id, writeScope), null),
  };
}
