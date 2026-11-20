import { useWeight } from "@/body";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useActiveProgram } from "@/training";
import {
  bodyweightLookup,
  dailyWeights,
  fromZonedParts,
  sessionGoal,
  type WeekStart,
  withWarmupsCounted,
} from "@workspace/shared";
import { watchFinishedHistory, watchRecordHistory, type FinishedSession } from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { buildHistory } from "./history-calendar";

const subscribeAll = (
  database: Parameters<typeof watchFinishedHistory>[0],
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) => watchFinishedHistory(database, { onSessions: onValue, onError });

const idle = () => () => undefined;

/** What the History screen needs from preferences and the active program. */
export function useHistorySettings() {
  const { preferences } = usePreferences();
  const program = useActiveProgram();
  const { sessionsPerWeek, weekStart, weightUnit } = preferences.ui;
  return {
    timezone: preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekStart,
    weightUnit,
    goal: sessionGoal(program.program, sessionsPerWeek),
  };
}

/**
 * The History for a visible period. A `window` (local days, see `historyWindow`) reads only the
 * Sessions of that range, so Week, Month and Year never wait for the whole log; `null` reads all
 * of it (the All period).
 */
export function useSessionHistory(
  window: { from: number; to: number } | null,
  timezone: string,
  weekStart: WeekStart,
) {
  const { preferences } = usePreferences();
  const weight = useWeight();
  const { bodyweightKg, countWarmups } = preferences.ui;
  const from = window?.from;
  const to = window?.to;
  const subscribeRange = useCallback(
    (
      database: Parameters<typeof watchFinishedHistory>[0],
      onValue: (sessions: FinishedSession[]) => void,
      onError: () => void,
    ) => {
      if (from === undefined || to === undefined) return idle();
      const day = (stamp: number) => {
        const date = new Date(stamp);
        return fromZonedParts(
          {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: 0,
            minute: 0,
          },
          timezone,
        );
      };
      return watchFinishedHistory(
        database,
        { onSessions: onValue, onError },
        { from: day(from), to: day(to) },
      );
    },
    [from, to, timezone],
  );
  const ranged = useLocalWatch(subscribeRange);
  const all = useLocalWatch(window === null ? subscribeAll : idle);
  const state = window === null ? all : ranged;
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
