import { KG_PER_LB, MUSCLE_GROUPS, sessionTotals } from "@workspace/shared";
import { watchSessionsBetween, type FinishedSession, type TrainingDatabase } from "@workspace/sync";
import { useCallback } from "react";
import { z } from "zod";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";

const subscribe = (
  db: TrainingDatabase,
  onValue: (sessions: FinishedSession[]) => void,
  onError: () => void,
) =>
  watchSessionsBetween(
    db,
    { from: "1970-01-01", to: "9999-01-01" },
    { onSessions: onValue, onError },
  );
const exerciseSchema = z.object({
  id: z.string(),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z
    .string()
    .transform((text) => JSON.parse(text))
    .pipe(z.array(z.enum(MUSCLE_GROUPS))),
});
export function useHomeTraining() {
  const history = useLocalWatch(subscribe);
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
      label: formatter.format(new Date(from)),
      x: from,
      y: preferences.ui.weightUnit === "lb" ? totals.volume / KG_PER_LB : totals.volume,
      items,
      ...totals,
    };
  });
  return {
    sessions,
    buckets,
    exercises: muscles.value ?? [],
    weightUnit: preferences.ui.weightUnit,
    loading: history.loading,
    failed: history.failed,
    retry: history.retry,
  };
}
