import { useWeight } from "@/body";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useActiveProgram } from "@/training";
import {
  bodyweightLookup,
  dailyWeights,
  sessionGoal,
  type WeekStart,
  withWarmupsCounted,
} from "@workspace/shared";
import {
  watchHistoryOverview,
  watchRecordHistory,
  type FinishedSession,
  type HistoryOverviewSession,
} from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { buildHistory } from "./history-calendar";

const idle = () => () => undefined;

/** What the History screen needs from preferences and the active program. */
export function useHistorySettings() {
  const { preferences, timeZone } = usePreferences();
  const program = useActiveProgram();
  const { sessionsPerWeek, weekStart, weightUnit } = preferences.ui;
  return {
    timezone: timeZone,
    weekStart,
    weightUnit,
    goal: sessionGoal(program.program, sessionsPerWeek),
  };
}

/** The whole History: every finished Session, with its per-day, week, month and year buckets. */
export function useSessionHistory(timezone: string, weekStart: WeekStart, focused: boolean) {
  const { preferences } = usePreferences();
  const weight = useWeight();
  const { bodyweightKg, countWarmups } = preferences.ui;
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchHistoryOverview>[0],
      onValue: (sessions: HistoryOverviewSession[]) => void,
      onError: () => void,
    ) => (focused ? watchHistoryOverview(database, { onSessions: onValue, onError }) : idle()),
    [focused],
  );
  const state = useLocalWatch(subscribe);
  const { entries } = weight;
  const history = useMemo(() => {
    // The same rule as session detail (`bodyweightOn`): measured weight through the day, resolved
    // once per account-local day.
    const lookup = bodyweightLookup(dailyWeights(entries), bodyweightKg);
    const byDay = new Map<number, number | null>();
    return buildHistory(
      withWarmupsCounted(state.value ?? [], countWarmups),
      timezone,
      weekStart,
      (day) => {
        if (byDay.has(day)) return byDay.get(day) ?? null;
        const kg = lookup(new Date(day).toISOString().slice(0, 10));
        byDay.set(day, kg);
        return kg;
      },
    );
  }, [state.value, entries, timezone, weekStart, bodyweightKg, countWarmups]);

  return {
    history,
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
