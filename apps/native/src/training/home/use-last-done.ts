import { watchSessionPage, type FinishedSession, type TrainingDatabase } from "@workspace/sync";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";

/** How many recent sessions the Train list looks through for when each workout was last done. */
const RECENT_SESSIONS = 80;

const subscribe = (
  db: TrainingDatabase,
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) =>
  watchSessionPage(db, { startedAt: "9999-01-01T00:00:00.000Z", id: "~" }, RECENT_SESSIONS, {
    onSessions: onValue,
    onError,
  });

/**
 * When each workout was last done, newest session first, from the most recent sessions. A workout
 * not done in them has no entry, so its row shows no "last done" line.
 */
export function useLastDone() {
  const recent = useLocalWatch(subscribe);
  const timeZone = useDeviceTimeZone();
  const timezone = timeZone;
  const lastDone = new Map<string, string>();
  for (const session of recent.value ?? []) {
    if (session.workoutId && !lastDone.has(session.workoutId))
      lastDone.set(session.workoutId, session.started_at);
  }
  return { lastDone, timezone };
}
