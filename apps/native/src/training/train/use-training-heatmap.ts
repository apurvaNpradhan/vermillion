import { calendarDay, weekStartDay } from "@workspace/shared";
import { watchSessionsBetween, type FinishedSession, type TrainingDatabase } from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { heatmapColumns } from "@/platform/ui/heatmap-chart-math";
import { usePreferences } from "@/preferences";

import { HEATMAP_WEEKS, heatmapTotals, setsByDay } from "./heatmap-data";

const DAY_MS = 86_400_000;

/** The Train heatmap's data: Counted sets per day over the last 26 weeks, as grid columns. */
export function useTrainingHeatmap() {
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { weekStart } = preferences.ui;
  // The clock is read once per mount, like the other screens.
  const today = useMemo(() => calendarDay(new Date(), timezone), [timezone]);
  const first = weekStartDay(today, weekStart) - (HEATMAP_WEEKS - 1) * 7 * DAY_MS;
  // A day of slack each side: Sessions are stored in UTC and bucketed by the user's day.
  const from = new Date(first - DAY_MS).toISOString();
  const history = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (sessions: FinishedSession[]) => void, onError: () => void) =>
        watchSessionsBetween(db, { from, to: "9999-01-01" }, { onSessions: onValue, onError }),
      [from],
    ),
  );
  const sessions = history.value;
  return useMemo(() => {
    const counts = setsByDay(sessions ?? [], timezone);
    return {
      loading: history.loading,
      failed: history.failed,
      columns: heatmapColumns({ counts, end: today, weeks: HEATMAP_WEEKS, weekStart }),
      totals: heatmapTotals(counts, first),
    };
  }, [sessions, timezone, today, weekStart, first, history.loading, history.failed]);
}
