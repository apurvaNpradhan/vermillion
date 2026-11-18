import {
  muscleContributions,
  muscleRows,
  onTargetCount,
  plannedMuscleVolume,
  shiftWeek,
  sessionsInRange,
  weekRange,
  weeklyMuscleVolume,
  type MuscleGoal,
  type MuscleGoals,
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
import { useCallback, useState } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";

const DAY_MS = 86_400_000;

/**
 * Muscle volume for the week `weeksAgo` weeks back: Counted sets per muscle against each muscle's
 * weekly range, plus the goal writer. Reads that week's Sessions and the muscles of their
 * exercises from the local database.
 */
export function useMuscleVolume(weeksAgo: number, program: ProgramDetail | null) {
  const { preferences, setUi } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { weekStart, muscleGoals } = preferences.ui;
  // The clock is read once per mount; a screen left open across midnight shows the old week.
  const [now] = useState(() => new Date());
  const week = shiftWeek(weekRange(now, timezone, weekStart), weeksAgo);
  // A day of slack each side: Sessions are stored in UTC and bucketed by the user's calendar day.
  const from = new Date(week.start - DAY_MS).toISOString();
  const to = new Date(week.end + DAY_MS).toISOString();
  const history = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (sessions: FinishedSession[]) => void, onError: () => void) =>
        watchSessionsBetween(db, { from, to }, { onSessions: onValue, onError }),
      [from, to],
    ),
  );
  const sessions = sessionsInRange(history.value ?? [], week, timezone);
  const ids = [
    ...new Set(sessions.flatMap((session) => session.sets.map((set) => set.exercise_id))),
  ];
  const idsKey = [...ids].sort().join(",");
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
  const exercises = muscles.value ?? [];
  const loads = weeklyMuscleVolume(sessions, exercises, week, timezone);
  const planned = program === null ? null : plannedMuscleVolume(program);
  const rows = muscleRows(loads, muscleGoals, planned);
  return {
    loading: history.loading || muscles.loading,
    failed: history.failed || muscles.failed,
    retry: () => {
      history.retry();
      muscles.retry();
    },
    week,
    timezone,
    goals: muscleGoals,
    planned,
    loads,
    rows,
    onTarget: onTargetCount(rows),
    contributions: (muscle: TargetMuscle) =>
      muscleContributions(sessions, exercises, muscle, week, timezone),
    setGoal: (muscle: TargetMuscle, goal: MuscleGoal | null) => {
      const next: MuscleGoals = { ...muscleGoals };
      if (goal === null) delete next[muscle];
      else next[muscle] = goal;
      setUi({ muscleGoals: next });
    },
  };
}
