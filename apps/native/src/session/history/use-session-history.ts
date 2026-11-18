import { useWeight } from "@/body";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useActiveProgram } from "@/training";
import { dailyWeights, sessionGoal, trendAt, trendSeries } from "@workspace/shared";
import { watchFinishedHistory, watchRecordHistory, type FinishedSession } from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { buildHistory } from "./history-calendar";

const subscribe = (
  database: Parameters<typeof watchFinishedHistory>[0],
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) => watchFinishedHistory(database, { onSessions: onValue, onError });

export function useSessionHistory() {
  const state = useLocalWatch(subscribe);
  const { preferences } = usePreferences();
  const weight = useWeight();
  const program = useActiveProgram();
  const { bodyweightKg, sessionsPerWeek, weekStart, weightUnit } = preferences.ui;
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { entries } = weight;
  const history = useMemo(() => {
    const series = trendSeries(dailyWeights(entries));
    return buildHistory(state.value ?? [], timezone, weekStart, (day) =>
      entries.length ? trendAt(series, new Date(day).toISOString().slice(0, 10)) : bodyweightKg,
    );
  }, [state.value, entries, timezone, weekStart, bodyweightKg]);

  return {
    history,
    timezone,
    weekStart,
    weightUnit,
    goal: sessionGoal(program.program, sessionsPerWeek),
    // SQLite controls History availability. Preferences and weigh-ins can arrive separately.
    loading: state.loading,
    failed: state.failed,
    retry: state.retry,
  };
}

/** Record comparisons use only the exercises in the session. */
export function useRecordHistory(exerciseIds: readonly string[]) {
  const key = [...new Set(exerciseIds)].sort().join("|");
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchRecordHistory>[0],
      onValue: (value: FinishedSession[]) => void,
      onError: () => void,
    ) => watchRecordHistory(database, key ? key.split("|") : [], { onSessions: onValue, onError }),
    [key],
  );
  const state = useLocalWatch(subscribe);
  const weight = useWeight();
  return {
    sessions: weight.withBodyweight(state.value ?? []),
    loading: state.loading,
    failed: state.failed,
    retry: state.retry,
  };
}
