import {
  muscleContributions,
  muscleRows,
  onTargetCount,
  plannedMuscleVolume,
  shiftWeek,
  weekRange,
  weeklyDetailVolume,
  weeklyMuscleVolume,
  withWarmupsCounted,
  type TargetMuscle,
} from "@workspace/shared";
import {
  watchExerciseMuscles,
  watchSessionsBetween,
  type ExerciseMuscles,
  type FinishedSession,
  type ProgramDetail,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";

import { muscleTrend, priorAverage, TREND_WEEKS } from "./muscle-trend";

const DAY_MS = 86_400_000;

/**
 * Muscle volume for this week and the weeks behind it: weighted sets per muscle (1 for the
 * primary muscle, ½ for each secondary) against each muscle's weekly range, the same by detail,
 * each muscle's last eight weeks and its average over the four whole weeks before this one, the
 * Counted sets of each exercise, plus the goal writer. Reads those weeks' Sessions and the muscles
 * of their exercises from the local database, once.
 */
export function useMuscleVolume(program: ProgramDetail | null, setFactor: number) {
  const { preferences, setMuscleGoal, timeZone } = usePreferences();
  const { now } = useToday(timeZone);
  const { weekStart, muscleGoals, countWarmups } = preferences.ui;
  const week = useMemo(() => weekRange(now, timeZone, weekStart), [now, timeZone, weekStart]);
  // A day of slack each side: Sessions are stored in UTC and bucketed by the user's calendar day.
  const from = new Date(shiftWeek(week, TREND_WEEKS - 1).start - DAY_MS).toISOString();
  const to = new Date(week.end + DAY_MS).toISOString();
  const history = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (sessions: FinishedSession[]) => void, onError: () => void) =>
        watchSessionsBetween(db, { from, to }, { onSessions: onValue, onError }),
      [from, to],
    ),
  );
  const sessions = useMemo(
    () =>
      history.failed || !history.value
        ? undefined
        : withWarmupsCounted(history.value, countWarmups),
    [history.failed, history.value, countWarmups],
  );
  const idsKey = useMemo(
    () =>
      [...new Set((sessions ?? []).flatMap((s) => s.sets.map((set) => set.exercise_id)))]
        .sort()
        .join(","),
    [sessions],
  );
  const muscles = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (rows: ExerciseMuscles[]) => void, onError: () => void) =>
        watchExerciseMuscles(db, idsKey === "" ? [] : idsKey.split(","), {
          onRows: onValue,
          onError,
        }),
      [idsKey],
    ),
  );
  const computed = useMemo(() => {
    const exercises = muscles.value ?? [];
    const found = sessions ?? [];
    const loads = weeklyMuscleVolume(found, exercises, week, timeZone);
    const planned = program === null ? null : plannedMuscleVolume(program, setFactor);
    const rows = muscleRows(loads, muscleGoals, planned);
    const trend = muscleTrend(found, exercises, week, timeZone);
    return {
      loads,
      detailLoads: weeklyDetailVolume(found, exercises, week, timeZone),
      planned,
      rows,
      onTarget: onTargetCount(rows),
      trend,
      contributions: (muscle: TargetMuscle) =>
        muscleContributions(found, exercises, muscle, week, timeZone),
    };
  }, [sessions, muscles.value, week, timeZone, program, muscleGoals, setFactor]);
  return {
    // Later reloads (a new exercise in this week's Sessions) keep what is on screen.
    loading: history.loading || (muscles.loading && muscles.value === undefined),
    failed: history.failed || muscles.failed,
    retry: () => {
      history.retry();
      muscles.retry();
    },
    goals: muscleGoals,
    ...computed,
    /** Sets a week over the four whole weeks before this one. */
    average: (muscle: TargetMuscle) => priorAverage(computed.trend.sets.get(muscle)),
    /** One writer per muscle: sending the whole map would erase another device's edit. */
    setGoal: setMuscleGoal,
  };
}
