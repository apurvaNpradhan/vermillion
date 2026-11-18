import { weekStartDay } from "@workspace/shared";
import {
  watchSessionSetCounts,
  type SessionSetCount,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { heatmapColumns } from "@/platform/ui/heatmap-chart-math";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";

import { HEATMAP_WEEKS, heatmapTotals, setsByDay } from "./heatmap-data";

const DAY_MS = 86_400_000;

/**
 * The Train heatmap's data: Counted sets per day over the last 26 weeks, as grid columns. It reads
 * one small row per Session in that window (a SQL count, not the Sessions' sets), so the 500
 * Session cap of the History reads does not cut the history short, and it has its own readiness.
 */
export function useTrainingHeatmap() {
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { weekStart } = preferences.ui;
  const { today } = useToday(timezone);
  const first = weekStartDay(today, weekStart) - (HEATMAP_WEEKS - 1) * 7 * DAY_MS;
  // A day of slack each side: Sessions are stored in UTC and bucketed by the user's day.
  const from = new Date(first - DAY_MS).toISOString();
  const to = new Date(today + 2 * DAY_MS).toISOString();
  const history = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (counts: SessionSetCount[]) => void, onError: () => void) =>
        watchSessionSetCounts(db, { from, to }, { onCounts: onValue, onError }),
      [from, to],
    ),
  );
  const rows = history.value;
  return useMemo(() => {
    const columns = heatmapColumns({
      counts: setsByDay(rows ?? [], timezone),
      end: today,
      weeks: HEATMAP_WEEKS,
      weekStart,
    });
    return {
      loading: history.loading,
      failed: history.failed,
      retry: history.retry,
      columns,
      totals: heatmapTotals(columns),
    };
  }, [rows, timezone, today, weekStart, history.loading, history.failed, history.retry]);
}
