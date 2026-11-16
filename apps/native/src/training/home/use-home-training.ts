import { useWeight } from "@/body";
import {
  watchSessionPage,
  watchSessionsBetween,
  type FinishedSession,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";

const subscribeRecent = (
  db: TrainingDatabase,
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) =>
  watchSessionPage(db, { startedAt: "9999-01-01T00:00:00.000Z", id: "~" }, 1, {
    onSessions: onValue,
    onError,
  });
export function useHomeTraining(workoutId?: string) {
  const weight = useWeight();
  // Home reads this and last week and the last 30 days; the latest Session comes separately.
  const from = new Date(Date.now() - 6 * 7 * 86400000).toISOString().slice(0, 10);
  const history = useLocalWatch(
    useCallback(
      (db: TrainingDatabase, onValue: (sessions: FinishedSession[]) => void, onError: () => void) =>
        watchSessionsBetween(
          db,
          { from: workoutId ? "1970-01-01" : from, to: "9999-01-01", workoutId },
          { onSessions: onValue, onError },
        ),
      [from, workoutId],
    ),
  );
  const recent = useLocalWatch(subscribeRecent);
  const { preferences } = usePreferences();
  const zone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sessions = weight.withBodyweight(history.value ?? []);
  return {
    sessions,
    recent: weight.withBodyweight(recent.value ?? []),
    timezone: zone,
    bodyweightKg: preferences.ui.bodyweightKg,
    weightUnit: preferences.ui.weightUnit,
    weekStart: preferences.ui.weekStart,
    sessionsPerWeek: preferences.ui.sessionsPerWeek,
    loading: history.loading || recent.loading,
    failed: history.failed || recent.failed,
    retry: () => {
      history.retry();
      recent.retry();
    },
  };
}
