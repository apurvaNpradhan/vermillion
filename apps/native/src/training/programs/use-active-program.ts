import { activeRun, cycleState, runWeek } from "@workspace/shared";
import {
  activateProgram,
  finishRun,
  keepGoing,
  runAgain,
  stopProgram,
  watchRunState,
} from "@workspace/sync";
import { useCallback, useState } from "react";
import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
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

export function useActiveProgram() {
  const { write, writeScope } = useTrainingWrite();
  const { timeZone } = usePreferences();
  const { run, runs, runProgramId, loading, activate, stop, confirmationProps } = useActiveRun();
  const detail = useProgram(run?.program_id ?? "");
  const program = detail.status === "ready" ? detail.program : null;
  const sessions = runs.value?.sessions.flatMap((s) => (s.runId === run?.id ? [s] : [])) ?? [];
  const progress = cycleState(program?.slots ?? [], sessions);
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
    finish: () => run && write((db) => finishRun(db, run.id, writeScope), undefined),
    keep: () => run && write((db) => keepGoing(db, run.id, writeScope), undefined),
    again: () => run && write((db) => runAgain(db, run.id, run.program_id, writeScope), null),
  };
}
