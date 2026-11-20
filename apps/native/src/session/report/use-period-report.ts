import { useWeight } from "@/body";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";
import { bodyweightLookup, calendarDay, dailyWeights, type WeightUnit } from "@workspace/shared";
import {
  watchExerciseMuscles,
  watchFinishedHistory,
  type ExerciseMuscles,
  type FinishedSession,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useHistorySettings } from "../history/use-session-history";
import { buildPeriodReport, type PeriodReport } from "./period-report";
import { reportEnd, type ReportPeriod } from "./report-period";

const subscribeAll = (
  database: TrainingDatabase,
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) => watchFinishedHistory(database, { onSessions: onValue, onError });

export type PeriodReportState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      report: PeriodReport;
      timezone: string;
      weightUnit: WeightUnit;
    };

/**
 * The report of one month or year, from the local database: every finished Session (the previous
 * period and earlier Records need them) with each set's bodyweight of its day attached, and the
 * muscles and titles of the exercises done in the period.
 */
export function usePeriodReport(period: ReportPeriod): PeriodReportState {
  const { timezone, weekStart, weightUnit, goal } = useHistorySettings();
  const { today } = useToday(timezone);
  const weight = useWeight();
  const { entries } = weight;
  const { bodyweightKg } = usePreferences().preferences.ui;
  const history = useLocalWatch(subscribeAll);
  const { start } = period;
  const end = reportEnd(period);
  const sessions = useMemo(() => {
    // The same rule as History: measured weight through the day, resolved once per local day.
    const lookup = bodyweightLookup(dailyWeights(entries), bodyweightKg);
    const byDay = new Map<number, number | null>();
    const kgOn = (startedAt: string) => {
      const day = calendarDay(startedAt, timezone);
      if (!byDay.has(day)) byDay.set(day, lookup(new Date(day).toISOString().slice(0, 10)));
      return byDay.get(day) ?? null;
    };
    return (history.value ?? []).map((session) => {
      const kg = kgOn(session.started_at);
      return { ...session, sets: session.sets.map((set) => ({ ...set, bodyweight_kg: kg })) };
    });
  }, [history.value, entries, bodyweightKg, timezone]);
  const idsKey = useMemo(
    () =>
      [
        ...new Set(
          sessions.flatMap((session) => {
            const day = calendarDay(session.started_at, timezone);
            return day >= start && day < end ? session.sets.map((set) => set.exercise_id) : [];
          }),
        ),
      ]
        .sort()
        .join(","),
    [sessions, timezone, start, end],
  );
  const muscles = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: (rows: ExerciseMuscles[]) => void,
        onError: () => void,
      ) =>
        watchExerciseMuscles(database, idsKey === "" ? [] : idsKey.split(","), {
          onRows: onValue,
          onError,
        }),
      [idsKey],
    ),
  );
  const exercises = muscles.value;
  const report = useMemo(
    () =>
      exercises === undefined
        ? null
        : buildPeriodReport({
            period: { kind: period.kind, start },
            sessions,
            exercises,
            timezone,
            weekStart,
            goal,
            today,
          }),
    [exercises, sessions, period.kind, start, timezone, weekStart, goal, today],
  );
  if (history.failed || muscles.failed) {
    return {
      status: "error",
      retry: () => {
        history.retry();
        muscles.retry();
      },
    };
  }
  if (history.loading || muscles.loading || weight.loading || report === null)
    return { status: "loading" };
  return { status: "ready", report, timezone, weightUnit };
}
