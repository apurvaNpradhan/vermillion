import type { SessionHistory } from "@workspace/shared";
import {
  dailyWeights,
  trendSeries,
  trendAt,
  changeOver,
  ratePerWeek,
  weightChanges,
  weighInDays,
} from "@workspace/shared";
import { watchMetric, type TrainingDatabase, type WatchedMeasurement } from "@workspace/sync";
import { useCallback, useState } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
const subscribe = (
  db: TrainingDatabase,
  onValue: (rows: WatchedMeasurement[]) => void,
  onError: () => void,
) => watchMetric(db, "weight", { onEntries: onValue, onError });
export function useWeight() {
  const state = useLocalWatch(subscribe);
  const [entryLimit, setEntryLimit] = useState(50);
  const { preferences, isLoading, hasPreferences, refresh } = usePreferences();
  const entries = state.value ?? [];
  const series = trendSeries(dailyWeights(entries));
  const zone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDate = useCallback(
    (date: string) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(date));
      return ["year", "month", "day"]
        .map((key) => parts.find((p) => p.type === key)?.value)
        .join("-");
    },
    [zone],
  );
  const today = localDate(new Date().toISOString());
  const months = new Map<string, WatchedMeasurement[]>();
  for (const entry of entries.slice(-entryLimit).reverse()) {
    const month = entry.local_date.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(entry);
    months.set(month, rows);
  }
  const bodyweightOn = (date: string) =>
    entries.length ? trendAt(series, localDate(date)) : preferences.ui.bodyweightKg;
  const withBodyweight = <T extends SessionHistory>(sessions: readonly T[]): T[] =>
    sessions.map((s) => ({
      ...s,
      sets: s.sets.map((set) => ({ ...set, bodyweight_kg: bodyweightOn(s.started_at) })),
    }));
  return {
    ...state,
    loading: state.loading || isLoading,
    failed: state.failed || (!isLoading && !hasPreferences),
    retry: () => {
      state.retry();
      void refresh().catch(() => undefined);
    },
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
    rate: ratePerWeek(series),
    changes: weightChanges(series),
    days: weighInDays(entries, today),
    bodyweightOn: (date: string) =>
      entries.length ? trendAt(series, localDate(date)) : preferences.ui.bodyweightKg,
    unit: preferences.ui.weightUnit,
    goal: preferences.ui.weightGoalKg,
  };
}
