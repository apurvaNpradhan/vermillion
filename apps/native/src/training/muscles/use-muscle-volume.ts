import {
  isCounted,
  muscleContributions,
  muscleRows,
  onTargetCount,
  plannedMuscleVolume,
  weeklyDetailVolume,
  weeklyMuscleVolume,
  type TargetMuscle,
  type WeekRange,
} from "@workspace/shared";
import {
  watchExerciseMuscles,
  watchSessionsBetween,
  type ExerciseMuscles,
  type FinishedSession,
  type ProgramDetail,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback, useMemo, useState } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";

import { muscleSessionsInRange, muscleWindow } from "./muscle-window";

const DAY_MS = 86_400_000;

/**
 * Muscle volume for the week `weeksAgo` weeks back: weighted sets per muscle (1 for the primary
 * muscle, ½ for each secondary) against each muscle's weekly range, the Counted sets themselves,
 * plus the goal writer. Reads that period's Sessions and the muscles of their exercises from the
 * local database. With `weeks` above one, the window is that many whole weeks ending the week
 * before the one `weeksAgo` back, and every figure is the average per week.
 *
 * Moving to another period keeps the previous result on screen until the next one has loaded:
 * `loading` is only true before the first result, and `refreshing` while a later one is on its way.
 */
export function useMuscleVolume(weeksAgo: number, program: ProgramDetail | null, weeks = 1) {
  const { preferences, timeZone } = usePreferences();
  const timezone = timeZone;
  const { now } = useToday(timezone);
  const { weekStart } = preferences.ui;
  const week = useMemo(
    () => muscleWindow(now, timezone, weekStart, weeksAgo, weeks),
    [now, timezone, weekStart, weeksAgo, weeks],
  );
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
  const volume = useMuscleLoads({
    sessions: history.failed ? undefined : history.value,
    week,
    weeks,
    weeksAgo,
    program,
  });
  return {
    ...volume,
    failed: history.failed || volume.failed,
    retry: () => {
      history.retry();
      volume.retry();
    },
  };
}

/**
 * The same figures from Sessions the caller already holds (`undefined` while they load), so a
 * screen that watches the Sessions for other reasons, such as Home, does not watch them twice.
 * Only the muscles of their exercises are read here.
 */
export function useMuscleLoads({
  sessions: history,
  week,
  weeks = 1,
  weeksAgo = 0,
  program,
}: {
  sessions: readonly FinishedSession[] | undefined;
  week: WeekRange;
  weeks?: number;
  /** Which period `week` is, kept with the result so a held one is labelled as itself. */
  weeksAgo?: number;
  program: ProgramDetail | null;
}) {
  const { preferences, setMuscleGoal, timeZone } = usePreferences();
  const timezone = timeZone;
  const { muscleGoals, countWarmups } = preferences.ui;
  const { start, end } = week;
  const range = useMemo(() => ({ start, end }), [start, end]);
  const sessions = useMemo(
    () => (history ? muscleSessionsInRange(history, range, timezone, countWarmups) : undefined),
    [history, countWarmups, range, timezone],
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
  const ready = sessions !== undefined && !muscles.loading && !muscles.failed;
  const computed = useMemo(() => {
    const exercises = muscles.value ?? [];
    const found = sessions ?? [];
    const loads = weeklyMuscleVolume(found, exercises, range, timezone).map((load) => ({
      ...load,
      sets: load.sets / weeks,
    }));
    const detailLoads = weeklyDetailVolume(found, exercises, range, timezone).map((load) => ({
      ...load,
      parts: load.parts.map((part) => ({ ...part, sets: part.sets / weeks })),
    }));
    const planned = program === null ? null : plannedMuscleVolume(program);
    const rows = muscleRows(loads, muscleGoals, planned);
    const completedSets =
      found.reduce((sum, session) => sum + session.sets.filter(isCounted).length, 0) / weeks;
    return {
      week: range,
      weeks,
      weeksAgo,
      sessions: found,
      exercises,
      loads,
      detailLoads,
      planned,
      rows,
      completedSets,
      onTarget: onTargetCount(rows),
    };
  }, [sessions, muscles.value, range, timezone, weeks, weeksAgo, program, muscleGoals]);
  // The last result that was ready, kept while the next period loads. Stored when the content
  // changes (compared by value, so a re-render with the same data cannot loop).
  const signature = JSON.stringify([
    computed.week,
    computed.weeks,
    computed.weeksAgo,
    computed.loads,
    computed.detailLoads,
    computed.planned,
    computed.rows,
  ]);
  const [kept, setKept] = useState<{ signature: string; value: typeof computed } | null>(null);
  if (ready && kept?.signature !== signature) setKept({ signature, value: computed });
  const shown = ready ? computed : (kept?.value ?? null);
  return {
    loading: shown === null && !muscles.failed,
    refreshing: !ready,
    failed: muscles.failed,
    retry: muscles.retry,
    week: shown?.week ?? range,
    /** Weeks and offset of the period shown, which lag the requested ones while it loads. */
    weeks: shown?.weeks ?? weeks,
    weeksAgo: shown?.weeksAgo ?? weeksAgo,
    timezone,
    goals: muscleGoals,
    planned: shown?.planned ?? null,
    loads: shown?.loads ?? EMPTY_LOADS,
    /** Each group's sets split into its muscle details (already a weekly average). */
    detailLoads: shown?.detailLoads ?? EMPTY_DETAIL_LOADS,
    rows: shown?.rows ?? EMPTY_ROWS,
    /** Counted sets in the period (a weekly average over several weeks); not weighted. */
    completedSets: shown?.completedSets ?? 0,
    onTarget: shown?.onTarget ?? 0,
    contributions: (muscle: TargetMuscle) =>
      shown === null
        ? []
        : muscleContributions(shown.sessions, shown.exercises, muscle, shown.week, timezone).map(
            (entry) => ({ ...entry, sets: entry.sets / shown.weeks }),
          ),
    // One muscle at a time: sending the whole map would erase another device's edit.
    setGoal: setMuscleGoal,
  };
}

const EMPTY_LOADS: ReturnType<typeof weeklyMuscleVolume> = [];
const EMPTY_DETAIL_LOADS: ReturnType<typeof weeklyDetailVolume> = [];
const EMPTY_ROWS: ReturnType<typeof muscleRows> = [];
