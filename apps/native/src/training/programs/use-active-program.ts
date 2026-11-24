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
import { useCallback, useState } from "react";
import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useProgram } from "./use-program";
import { useTrainingWrite } from "@/training/shared/use-training-write";

/**
 * The active Run and what changes it: one local watch, no Program detail. Lists that only mark
 * which Program is active use this, so a list of rows costs one watch, not two per row.
 */
export function useActiveRun() {
  const { t } = useTranslation();
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);
  const { write, writeScope } = useTrainingWrite();
  const subscribe = useCallback(
    (...args: Parameters<typeof watchRunState>) => watchRunState(...args),
    [],
  );
  const state = useLocalWatch(subscribe);
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
  return cycleState(
    slots,
    value?.sessions.filter((session) => session.runId === runId) ?? [],
    value?.skips.filter((skip) => skip.runId === runId) ?? [],
  );
}

export function useActiveProgram() {
  const { t } = useTranslation();
  const { write, writeScope, undoToast } = useTrainingWrite();
  const timeZone = useDeviceTimeZone();
  const { run, runs, runProgramId, loading, activate, stop, confirmationProps } = useActiveRun();
  const detail = useProgram(run?.program_id ?? "");
  const program = detail.status === "ready" ? detail.program : null;
  const progress = runProgress(runs, run?.id ?? null, program?.slots ?? []);
  const unskip = (slotId: string) =>
    run
      ? write(
          (db) => unskipSlot(db, { runId: run.id, slotId, cycle: progress.cycle }, writeScope),
          false,
        )
      : false;
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
    /** Takes a skip of the current Cycle back. */
    unskip,
    /** Leaves a Slot out of the current Cycle (it counts as done for it) and offers Undo. */
    skip: async (slotId: string, title: string) => {
      if (!run) return;
      const cycle = progress.cycle;
      const id = await write(
        (db) => skipSlot(db, { runId: run.id, slotId, cycle }, writeScope),
        null,
      );
      if (id === null) return;
      undoToast(t("run__skipped_toast", { title }), () => {
        void write((db) => unskipSlot(db, { runId: run.id, slotId, cycle }, writeScope), false);
      });
    },
    finish: () => run && write((db) => finishRun(db, run.id, writeScope), undefined),
    keep: () => run && write((db) => keepGoing(db, run.id, writeScope), undefined),
    again: () => run && write((db) => runAgain(db, run.id, run.program_id, writeScope), null),
  };
}
