import { useWeight } from "@/body";
import {
  addsLoad,
  SET_FIELDS,
  type Equipment,
  type WeekStart,
  type WeightUnit,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { LineChart, BarChart } from "@/platform/ui/charts/chart";
import { TIME_STEPS, type Aggregate } from "@/platform/ui/charts/scales";
import { useState } from "react";
import { ExerciseRecords } from "./exercise-records";
import { ExerciseStatTiles } from "./exercise-stats";
import { NextTimeLine } from "./next-time-line";
import { metricSeries, metricsFor, paceSecondsPerKm, formatClock, type Metric } from "../numbers";
import { useMetricFormat } from "../use-metric-format";

/** Volume, distance and counts are totals or bests per period, drawn as bars. */
const BAR_METRICS: ReadonlySet<Metric> = new Set([
  "set_volume",
  "session_volume",
  "longest_distance",
  "total_reps",
  "floors",
  "steps",
]);

/** How a week of sessions becomes one bar or point: totals add up, bests keep the best. */
const AGGREGATE: Partial<Record<Metric, Aggregate>> = {
  session_volume: "sum",
  total_reps: "sum",
  floors: "sum",
  steps: "sum",
  // Pace is plotted in seconds per kilometre, where lower is faster.
  best_pace: "min",
};

/** Metrics whose axis fits the data instead of starting at zero. */
const DATA_DOMAIN: ReadonlySet<Metric> = new Set([
  "heaviest_weight",
  "estimated_one_rep_max",
  "longest_duration",
  "best_pace",
]);

/** The metric a chart opens on: the estimated one-rep max for lifts, else the first. */
function defaultMetric(metrics: readonly Metric[], type: Parameters<typeof metricsFor>[0]): Metric {
  const fields: readonly string[] = SET_FIELDS[type];
  if (!addsLoad(type) && fields.includes("weight") && fields.includes("reps"))
    return "estimated_one_rep_max";
  return metrics[0] ?? "total_reps";
}

/**
 * The user's numbers for an exercise, top to bottom: three stat tiles, one row of metric and range
 * chips over the chart, what to aim for next time, and the records as a two-column grid.
 */
export function ExerciseNumbers({
  sessions: rawSessions,
  exerciseId,
  type,
  bodyweightKg,
  unit,
  timezone,
  weekStart,
  equipment,
  gymId,
  weightIncrementKg,
  progressionPerSet,
}: {
  sessions: FinishedSession[];
  exerciseId: string;
  type: Parameters<typeof metricsFor>[0];
  bodyweightKg: number | null;
  unit: WeightUnit;
  timezone: string | null;
  weekStart: WeekStart;
  equipment: Equipment;
  gymId?: string | null;
  weightIncrementKg: number | null;
  progressionPerSet: boolean;
}) {
  const weight = useWeight();
  const sessions = weight.withBodyweight(rawSessions);
  const { t, i18n } = useTranslation();
  const { label, format } = useMetricFormat(type, unit);
  const metrics = metricsFor(type);
  const [selected, setSelected] = useState<Metric>(defaultMetric(metrics, type));
  const metric = metrics.includes(selected) ? selected : defaultMetric(metrics, type);
  const date = (value: string | number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: timezone ?? undefined,
    }).format(new Date(value));
  // Records keep pace as a speed (m/s, higher is faster); the chart plots seconds per kilometre.
  const points = metricSeries(sessions, exerciseId, metric, bodyweightKg).flatMap((p) => {
    const y = metric === "best_pace" ? paceSecondsPerKm(p.y) : p.y;
    return y === null ? [] : [{ ...p, y, label: date(p.x) }];
  });
  const formatPoint = (value: number) =>
    metric === "best_pace"
      ? t("exercise__value_pace", { value: formatClock(value) })
      : format(value, metric);
  const Chart = BAR_METRICS.has(metric) ? BarChart : LineChart;
  // Volume and the estimated one-rep max of these types need a bodyweight to be right.
  const needsBodyweight =
    bodyweightKg === null &&
    weight.entries.length === 0 &&
    (type === "bodyweight_reps" || type === "bodyweight_assisted_reps" || addsLoad(type));
  const settings = { weightUnit: unit, weightIncrementKg, progressionPerSet };
  return (
    <View className="gap-6 px-4">
      <ExerciseStatTiles
        sessions={sessions}
        exerciseId={exerciseId}
        type={type}
        unit={unit}
        bodyweightKg={bodyweightKg}
        timezone={timezone}
      />
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
          {t("exercise__your_numbers")}
        </Text>
        {needsBodyweight ? (
          <Text className="font-normal text-caption text-muted">
            {t("exercise__bodyweight_hint")}
          </Text>
        ) : null}
        <Chart
          points={points}
          week={{
            timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            weekStart,
          }}
          label={label(metric)}
          formatValue={formatPoint}
          aggregate={AGGREGATE[metric] ?? "max"}
          domain={DATA_DOMAIN.has(metric) ? "data" : undefined}
          tickSteps={
            metric === "longest_duration" || metric === "best_pace" ? TIME_STEPS : undefined
          }
          lowerIsBetter={metric === "best_pace"}
          best={BAR_METRICS.has(metric) ? undefined : metric === "best_pace" ? "low" : "high"}
          leading={
            metrics.length > 1
              ? metrics.map((key) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={key === metric ? "primary" : "tertiary"}
                    accessibilityState={{ selected: key === metric }}
                    onPress={() => setSelected(key)}
                  >
                    <Button.Label>{label(key)}</Button.Label>
                  </Button>
                ))
              : undefined
          }
        />
        {type === "weight_reps" ||
        addsLoad(type) ||
        type === "reps_only" ||
        type === "bodyweight_reps" ? (
          <NextTimeLine
            sessions={sessions}
            exerciseId={exerciseId}
            type={type}
            equipment={equipment}
            settings={settings}
            gymId={gymId}
          />
        ) : null}
      </View>
      <ExerciseRecords
        sessions={sessions}
        exerciseId={exerciseId}
        type={type}
        unit={unit}
        bodyweightKg={bodyweightKg}
        timezone={timezone}
      />
    </View>
  );
}
