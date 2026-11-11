import { KG_PER_LB, MUSCLE_GROUPS, sessionTotals } from "@workspace/shared";
import {
  watchSessionPage,
  watchSessionsBetween,
  type FinishedSession,
  type TrainingDatabase,
} from "@workspace/sync";
import { useCallback } from "react";
import { z } from "zod";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useTranslation } from "@/platform/i18n";
import { formatWeekLabel } from "./week-label";
import { usePreferences } from "@/preferences";

const subscribeRecent = (
  db: TrainingDatabase,
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) =>
  watchSessionPage(db, { startedAt: "9999-01-01T00:00:00.000Z", id: "~" }, 3, {
    onSessions: onValue,
    onError,
  });
const exerciseSchema = z.object({
  id: z.string(),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z
    .string()
    .transform((text) => JSON.parse(text))
    .pipe(z.array(z.enum(MUSCLE_GROUPS))),
});
export function useHomeTraining(workoutId?: string) {
  const { i18n } = useTranslation();
  // Home needs eight chart weeks, plus a small recent list even after a long break.
  const from = new Date(Date.now() - 9 * 7 * 86400000).toISOString().slice(0, 10);
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
  const muscles = useLocalWatch(
    useCallback((db, onValue: (rows: z.infer<typeof exerciseSchema>[]) => void, onError) => {
      const controller = new AbortController();
      db.watchWithCallback(
        "SELECT id, primary_muscle, secondary_muscles FROM exercise LIMIT 10000",
        [],
        {
          onResult: (result) => {
            const parsed = z.array(exerciseSchema).safeParse(result.array);
            if (parsed.success) onValue(parsed.data);
            else onError();
          },
          onError,
        },
        { signal: controller.signal, tables: ["exercise"] },
      );
      return () => controller.abort();
    }, []),
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const get = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"));
  };
  const today = day(new Date());
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * 86400000;
  const sessions = history.value ?? [];
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const from = monday - (7 - index) * 604800000;
    const items = sessions.flatMap((s) => {
      const started = day(new Date(s.started_at));
      return started >= from && started < from + 604800000 ? [s] : [];
    });
    const totals = sessionTotals(
      items.flatMap((s) => s.sets),
      preferences.ui.bodyweightKg,
    );
    return {
      id: String(from),
      label: formatWeekLabel(from, i18n.language),
      x: from,
      y: preferences.ui.weightUnit === "lb" ? totals.volume / KG_PER_LB : totals.volume,
      items,
      ...totals,
    };
  });
  return {
    sessions,
    recent: recent.value ?? [],
    buckets,
    exercises: muscles.value ?? [],
    timezone: zone,
    bodyweightKg: preferences.ui.bodyweightKg,
    weightUnit: preferences.ui.weightUnit,
    loading: history.loading || recent.loading,
    failed: history.failed || recent.failed,
    retry: () => {
      history.retry();
      recent.retry();
    },
  };
}
