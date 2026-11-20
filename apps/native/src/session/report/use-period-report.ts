import { useWeight } from "@/body";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";
import {
  bodyweightLookup,
  calendarDay,
  dailyWeights,
  isCounted,
  withWarmupsCounted,
} from "@workspace/shared";
import {
  watchExerciseMuscles,
  watchFinishedHistory,
  watchRecordHistory,
  type ExerciseMuscles,
  type FinishedSession,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useHistorySettings } from "../history/use-session-history";
import { buildPeriodReport, type PeriodReport } from "./period-report";
import { reportEnd, reportHistoryWindow, type ReportPeriod } from "./report-period";
import { reportWatchState, type ReportWatchState } from "./report-watch-state";

type PeriodReportState =
  | Exclude<ReportWatchState, { status: "ready" }>
  | { status: "ready"; report: PeriodReport };

const EMPTY_SESSIONS: FinishedSession[] = [];

/** Watches the report's comparison window, exercise metadata and earlier record history. */
export function usePeriodReport(period: ReportPeriod): PeriodReportState {
  const { timezone, weekStart, goal } = useHistorySettings();
  const { today } = useToday(timezone);
  const weight = useWeight();
  const { entries } = weight;
  const { bodyweightKg, countWarmups } = usePreferences().preferences.ui;
  const { start, kind } = period;
  const end = reportEnd(period);
  const window = reportHistoryWindow(period);
  const from = new Date(window.from).toISOString();
  const to = new Date(window.to).toISOString();
  const before = new Date(window.recordsBefore).toISOString();
  const history = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: (sessions: FinishedSession[]) => void,
        onError: () => void,
      ) => watchFinishedHistory(database, { onSessions: onValue, onError }, { from, to }),
      [from, to],
    ),
  );
  const sessions = useMemo(
    () => withWarmupsCounted(history.value ?? EMPTY_SESSIONS, countWarmups),
    [history.value, countWarmups],
  );
  const idsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      const day = calendarDay(session.started_at, timezone);
      if (day < start || day >= end) continue;
      for (const set of session.sets) {
        if (isCounted(set)) ids.add(set.exercise_id);
      }
    }
    return [...ids].sort().join("|");
  }, [sessions, timezone, start, end]);
  const muscles = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: (rows: ExerciseMuscles[]) => void,
        onError: () => void,
      ) =>
        watchExerciseMuscles(database, idsKey ? idsKey.split("|") : [], {
          onRows: onValue,
          onError,
        }),
      [idsKey],
    ),
  );
  const records = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: (rows: FinishedSession[]) => void,
        onError: () => void,
      ) =>
        watchRecordHistory(
          database,
          idsKey ? idsKey.split("|") : [],
          { onSessions: onValue, onError },
          before,
        ),
      [idsKey, before],
    ),
  );
  const state = reportWatchState({ history, muscles, records, weight });
  const ready = state.status === "ready";
  const exercises = muscles.value;
  const earlier = records.value;
  const report = useMemo(() => {
    if (!ready || exercises === undefined || earlier === undefined) return null;
    // Resolve measured weight through the session's day once across both reads.
    const lookup = bodyweightLookup(dailyWeights(entries), bodyweightKg);
    const byDay = new Map<number, number | null>();
    const attachBodyweight = (session: FinishedSession) => {
      const day = calendarDay(session.started_at, timezone);
      if (!byDay.has(day)) byDay.set(day, lookup(new Date(day).toISOString().slice(0, 10)));
      const kg = byDay.get(day) ?? null;
      return { ...session, sets: session.sets.map((set) => ({ ...set, bodyweight_kg: kg })) };
    };
    return buildPeriodReport({
      period: { kind, start },
      sessions: sessions.map(attachBodyweight),
      earlierHistory: withWarmupsCounted(earlier, countWarmups).map(attachBodyweight),
      exercises,
      timezone,
      weekStart,
      goal,
      today,
    });
  }, [
    ready,
    exercises,
    earlier,
    entries,
    bodyweightKg,
    timezone,
    kind,
    start,
    sessions,
    countWarmups,
    weekStart,
    goal,
    today,
  ]);
  if (state.status === "error") return state;
  return report === null ? { status: "loading" } : { status: "ready", report };
}
