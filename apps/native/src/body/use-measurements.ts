import { useCallback } from "react";
import {
  BODY_METRICS,
  lastN,
  ratios,
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
  type BodyMetric,
} from "@workspace/shared";
import { watchMetric, type TrainingDatabase, type WatchedMeasurement } from "@workspace/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useWeight } from "./use-weight";
type RatioHistory = { waistToHeight: number[]; waistToHip: number[] };
const subscribe = (
  db: TrainingDatabase,
  onValue: (rows: WatchedMeasurement[]) => void,
  onError: () => void,
) => {
  const latest = new Map<BodyMetric, WatchedMeasurement[]>();
  const stops = BODY_METRICS.map((metric) =>
    watchMetric(db, metric, {
      onError: () => {
        latest.delete(metric);
        onError();
      },
      onEntries: (rows) => {
        latest.set(metric, rows);
        if (latest.size === BODY_METRICS.length) onValue([...latest.values()].flat());
      },
    }),
  );
  return () => stops.forEach((stop) => stop());
};
export function useMeasurements() {
  const state = useLocalWatch(subscribe);
  const { preferences, isLoading } = usePreferences();
  const weight = useWeight();
  const ui = preferences.ui;
  const entries = state.value ?? [];
  const forMetric = useCallback(
    (metric: BodyMetric) => entries.filter((row) => row.metric === metric),
    [entries],
  );
  const display = (metric: BodyMetric, value: number) =>
    metric === "weight"
      ? ui.weightUnit === "lb"
        ? kgToLb(value)
        : value
      : ui.lengthUnit === "in"
        ? cmToIn(value)
        : value;
  const canonical = (metric: BodyMetric, value: number) =>
    metric === "weight"
      ? ui.weightUnit === "lb"
        ? lbToKg(value)
        : value
      : ui.lengthUnit === "in"
        ? inToCm(value)
        : value;
  const latest: Partial<Record<BodyMetric, number>> = {};
  const ratioHistory: RatioHistory = {
    waistToHeight: [],
    waistToHip: [],
  };
  for (const row of lastN(entries, entries.length)) {
    latest[row.metric] = row.value;
    const current = ratios(latest, ui.heightCm);
    if (row.metric === "waist" && current.waistToHeight !== null)
      ratioHistory.waistToHeight.push(current.waistToHeight);
    if ((row.metric === "waist" || row.metric === "hips") && current.waistToHip !== null)
      ratioHistory.waistToHip.push(current.waistToHip);
  }
  return {
    ...state,
    loading: state.loading || isLoading,
    ratioHistory,
    entries,
    forMetric,
    display,
    canonical,
    unit: (metric: BodyMetric) => (metric === "weight" ? ui.weightUnit : ui.lengthUnit),
    tracked: [...new Set(ui.trackedMetrics.filter((m) => m !== "weight"))],
    heightCm: ui.heightCm,
    localDate: weight.localDate,
    today: weight.today,
  };
}
