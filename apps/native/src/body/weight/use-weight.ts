import type { SessionHistory } from "@workspace/shared";
import {
  dailyWeights,
  trendSeries,
  bodyweightForDate,
  changeOver,
  ratePerWeek,
  weightChanges,
  weighInDays,
} from "@workspace/shared";
import { watchMetric, type TrainingDatabase, type WatchedMeasurement } from "@workspace/sync";
import { useCallback, useMemo, useState } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
const EMPTY: readonly WatchedMeasurement[] = [];
const subscribe = (
  db: TrainingDatabase,
  onValue: (rows: WatchedMeasurement[]) => void,
  onError: () => void,
) => watchMetric(db, "weight", { onEntries: onValue, onError });
export function useWeight() {
  const state = useLocalWatch(subscribe);
  const [entryLimit, setEntryLimit] = useState(50);
  const { preferences, isLoading, hasPreferences, timeZone } = usePreferences();
  const entries = state.value ?? EMPTY;
  const daily = useMemo(() => dailyWeights(entries), [entries]);
  const series = useMemo(() => trendSeries(daily), [daily]);
  const zone = timeZone;
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [zone],
  );
  const localDate = useCallback(
    (date: string) => {
      const parts = formatter.formatToParts(new Date(date));
      return ["year", "month", "day"]
        .map((key) => parts.find((p) => p.type === key)?.value)
        .join("-");
    },
    [formatter],
  );
  const today = localDate(new Date().toISOString());
  const months = new Map<string, WatchedMeasurement[]>();
  for (const entry of entries.slice(-entryLimit).reverse()) {
    const month = entry.local_date.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(entry);
    months.set(month, rows);
  }
  const fallbackKg = preferences.ui.bodyweightKg;
  const bodyweightOn = useCallback(
    (date: string) => bodyweightForDate(daily, localDate(date), fallbackKg),
    [daily, localDate, fallbackKg],
  );
  const countWarmups = preferences.ui.countWarmups;
  /**
   * The sessions as the numbers read them: each set carries the bodyweight of its day, and
   * warm-ups count when the user chose to count them ("Count warm-up sets").
   */
  const withBodyweight = useCallback(
    <T extends SessionHistory>(sessions: readonly T[]): T[] =>
      sessions.map((s) => {
        const kg = bodyweightOn(s.started_at);
        return {
          ...s,
          sets: s.sets.map((set) => ({
            ...set,
            bodyweight_kg: kg,
            ...(countWarmups && set.kind === "warmup" ? { warmup_counted: true } : {}),
          })),
        };
      }),
    [bodyweightOn, countWarmups],
  );
  return {
    ...state,
    loading: state.loading || isLoading,
    failed: state.failed || (!isLoading && !hasPreferences),
    retry: state.retry,
    withBodyweight,
    entries,
    series,
    months: [...months],
    hasMoreEntries: entries.length > entryLimit,
    loadMoreEntries: () => setEntryLimit((limit) => limit + 50),
    today,
    localDate,
    zone,
    trend: series.at(-1)?.trend ?? null,
    change: changeOver(series, 30),
    rate: ratePerWeek(series, today),
    lastMeasurementDate: daily.at(-1)?.date ?? null,
    changes: weightChanges(series),
    days: weighInDays(entries, today),
    bodyweightOn,
    unit: preferences.ui.weightUnit,
    goal: preferences.ui.weightGoalKg,
  };
}
