import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { deviceStorage } from "@/platform/storage";
import { useToday } from "@/platform/use-today";
import { usePreferences } from "@/preferences";
import { sessionsInRange } from "@workspace/shared";
import { watchSessionsBetween, type FinishedSession, type TrainingDatabase } from "@workspace/sync";
import { useCallback, useState } from "react";

import { DISMISSED_KEY, readDismissed, withDismissed } from "./dismissed";
import { reportCardPeriod, reportEnd, reportKey, type ReportPeriod } from "./report-period";

const DAY_MS = 86_400_000;
const idle = () => () => undefined;

/**
 * The report Home offers, or null: during the first days of a month, last month's (in January,
 * last year's), not dismissed on this device, and only when that period has any Session.
 */
export function useReportCard(): {
  period: ReportPeriod;
  reportId: string;
  dismiss: () => void;
} | null {
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { today } = useToday(timezone);
  const [dismissed, setDismissed] = useState(() => readDismissed(deviceStorage.get(DISMISSED_KEY)));
  const period = reportCardPeriod(today);
  const key = period === null ? null : reportKey(period);
  const watching = period !== null && key !== null && !dismissed.includes(key);
  const start = period?.start;
  const end = period === null ? undefined : reportEnd(period);
  const found = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: (sessions: FinishedSession[]) => void,
        onError: () => void,
      ) => {
        if (!watching || start === undefined || end === undefined) return idle();
        // A day of slack each side: Sessions are stored in UTC and bucketed by the local day.
        return watchSessionsBetween(
          database,
          {
            from: new Date(start - DAY_MS).toISOString(),
            to: new Date(end + DAY_MS).toISOString(),
          },
          { onSessions: onValue, onError },
        );
      },
      [watching, start, end],
    ),
  );
  const dismiss = useCallback(() => {
    if (key === null) return;
    setDismissed((current) => {
      const next = withDismissed(current, key);
      deviceStorage.set(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  }, [key]);
  if (!watching || period === null || key === null || found.value === undefined) return null;
  const inPeriod = sessionsInRange(
    found.value,
    { start: period.start, end: reportEnd(period) },
    timezone,
  );
  return inPeriod.length > 0 ? { period, reportId: key, dismiss } : null;
}
