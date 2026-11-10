import { activeRun, cycleState, runWeek } from "@workspace/shared";
import {
  activateProgram,
  finishRun,
  keepGoing,
  runAgain,
  stopProgram,
  watchRunState,
} from "@workspace/sync";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useProgram } from "./use-program";
import { useTrainingWrite } from "./use-training-write";

export function useActiveProgram() {
  const { t } = useTranslation();
  const { write, writeScope } = useTrainingWrite();
  const { preferences } = usePreferences();
  const subscribe = useCallback(
    (...args: Parameters<typeof watchRunState>) => watchRunState(...args),
    [],
  );
  const state = useLocalWatch(subscribe);
  const run = activeRun(state.value?.runs ?? []);
  const detail = useProgram(run?.program_id ?? "");
  const program = detail.status === "ready" ? detail.program : null;
  const sessions = state.value?.sessions.flatMap((s) => (s.runId === run?.id ? [s] : [])) ?? [];
  const progress = cycleState(program?.slots ?? [], sessions);
  const week = runWeek(
    run?.started_at ?? null,
    new Date(),
    preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const activate = (id: string) => {
    const apply = () => void write((db) => activateProgram(db, id, writeScope), null);
    if (run && run.program_id !== id)
      Alert.alert(t("run__switch_title"), t("run__switch_body"), [
        { text: t("common__cancel"), style: "cancel" },
        { text: t("run__set_active"), onPress: apply },
      ]);
    else apply();
  };
  return {
    run,
    program,
    progress,
    week,
    loading: state.loading,
    activate,
    stop: () => run && write((db) => stopProgram(db, run.id, writeScope), undefined),
    finish: () => run && write((db) => finishRun(db, run.id, writeScope), undefined),
    keep: () => run && write((db) => keepGoing(db, run.id, writeScope), undefined),
    again: () => run && write((db) => runAgain(db, run.id, run.program_id, writeScope), null),
  };
}
