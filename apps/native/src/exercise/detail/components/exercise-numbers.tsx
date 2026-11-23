import { useWeight } from "@/body";
import {
  addsLoad,
  type Equipment,
  KG_PER_LB,
  type RecordKey,
  type WeekStart,
  type WeightUnit,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { Button } from "@/platform/ui/button";
import { LineChart, BarChart } from "@/platform/ui/charts/chart";
import { TIME_STEPS, type Aggregate } from "@/platform/ui/charts/scales";
import { ExerciseProgress, NextTimeLine } from "./exercise-progress";
import {
  datedRecords,
  metricSeries,
  metricsFor,
  recordsByYear,
  recordYears,
  type Metric,
  paceSecondsPerKm,
  formatClock,
} from "../numbers";
import { useHumanUnits } from "../use-human-units";

const LABELS = {
  most_reps: "exercise__metric_most_reps",
  heaviest_weight: "exercise__metric_heaviest",
  estimated_one_rep_max: "exercise__metric_one_rm",
  set_volume: "exercise__metric_set_volume",
  session_volume: "exercise__metric_session_volume",
  total_reps: "exercise__metric_reps",
  longest_duration: "exercise__metric_duration",
  longest_distance: "exercise__metric_distance",
  best_pace: "exercise__metric_pace",
  floors: "exercise__metric_floors",
  steps: "exercise__metric_steps",
} as const;

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

function isMetricLabel(key: Metric): key is keyof typeof LABELS {
  return key in LABELS;
}

/** A record row: the shown best, and the all-time best beside it when a year is chosen. */
type YearRecord = ReturnType<typeof datedRecords>[number] & { allTime: number | null };

export function ExerciseNumbers({
  sessions: rawSessions,
  exerciseId,
  type,
  bodyweightKg,
  weekStart,
  unit,
  timezone,
  equipment,
  weightIncrementKg,
  progressionPerSet,
}: {
  sessions: FinishedSession[];
  exerciseId: string;
  type: Parameters<typeof metricsFor>[0];
  bodyweightKg: number | null;
  weekStart: WeekStart;
  unit: WeightUnit;
  timezone: string | null;
  equipment: Equipment;
  weightIncrementKg: number | null;
  progressionPerSet: boolean;
}) {
  const weight = useWeight();
  const sessions = weight.withBodyweight(rawSessions);
  const { t, i18n } = useTranslation();
  const human = useHumanUnits();
  const metrics = metricsFor(type);
  const [selected, setSelected] = useState<Metric>(metrics[0] ?? "total_reps");
  const metric = metrics.includes(selected) ? selected : (metrics[0] ?? "total_reps");
  const [help, setHelp] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const date = (value: string | number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: timezone ?? undefined,
    }).format(new Date(value));
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value);
  const label = (key: Metric) =>
    key.startsWith("reps_")
      ? t("exercise__record_reps", { count: Number(key.slice(5)) })
      : key === "heaviest_weight" && addsLoad(type)
        ? t("exercise__metric_added_load")
        : t(LABELS[isMetricLabel(key) ? key : "total_reps"]);
  const format = (value: number, key: Metric) => {
    if (key === "longest_duration") return human.duration(value);
    if (key === "longest_distance") return human.distance(value);
    if (key === "best_pace") return human.pace(value);
    if (key === "most_reps" || key === "total_reps" || key === "floors" || key === "steps")
      return number(value);
    const added = addsLoad(type) && (key === "heaviest_weight" || key.startsWith("reps_"));
    return t(
      key === "set_volume" || key === "session_volume"
        ? "exercise__value_volume"
        : added
          ? "exercise__value_added_weight"
          : "exercise__value_weight",
      {
        value: number(unit === "lb" ? value / KG_PER_LB : value),
        unit,
      },
    );
  };
  // Records keep pace as a speed (m/s, higher is faster); the chart plots seconds per kilometre.
  const points = metricSeries(sessions, exerciseId, metric, bodyweightKg).flatMap((p) => {
    const y = metric === "best_pace" ? paceSecondsPerKm(p.y) : p.y;
    return y === null ? [] : [{ ...p, y, label: date(p.x) }];
  });
  const formatPoint = (value: number) =>
    metric === "best_pace"
      ? t("exercise__value_pace", { value: formatClock(value) })
      : format(value, metric);
  const years = recordYears(sessions, exerciseId, timezone);
  // A year that no longer has data (a deleted Session) falls back to all time.
  const activeYear = year !== null && years.includes(year) ? year : null;
  const records =
    activeYear === null
      ? datedRecords(sessions, exerciseId, bodyweightKg).map((record): YearRecord => ({
          ...record,
          allTime: null,
        }))
      : recordsByYear(sessions, exerciseId, bodyweightKg, activeYear, timezone);
  const Chart = BAR_METRICS.has(metric) ? BarChart : LineChart;
  // Volume and the estimated one-rep max of these types need a bodyweight to be right.
  const needsBodyweight =
    bodyweightKg === null &&
    weight.entries.length === 0 &&
    (type === "bodyweight_reps" || type === "bodyweight_assisted_reps" || addsLoad(type));
  return (
    <View className="gap-6 px-4">
      {addsLoad(type) && needsBodyweight ? (
        <Text className="font-normal text-caption text-muted">
          {t("exercise__bodyweight_hint")}
        </Text>
      ) : null}
      {type === "weight_reps" || addsLoad(type) ? (
        <ExerciseProgress
          sessions={sessions}
          exerciseId={exerciseId}
          type={type}
          equipment={equipment}
          settings={{ weightUnit: unit, weightIncrementKg, progressionPerSet }}
          timezone={timezone}
          weekStart={weekStart}
          bodyweightKg={bodyweightKg}
        />
      ) : (
        <>
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("exercise__your_numbers")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {metrics.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={key === metric ? "primary" : "tertiary"}
                accessibilityState={{ selected: key === metric }}
                onPress={() => setSelected(key)}
              >
                <Button.Label>{label(key)}</Button.Label>
              </Button>
            ))}
          </ScrollView>
          {needsBodyweight ? (
            <Text className="font-normal text-caption text-muted">
              {t("exercise__bodyweight_hint")}
            </Text>
          ) : null}
          <Chart
            points={points}
            label={label(metric)}
            formatValue={formatPoint}
            aggregate={AGGREGATE[metric] ?? "max"}
            domain={metric === "longest_duration" || metric === "best_pace" ? "data" : undefined}
            tickSteps={
              metric === "longest_duration" || metric === "best_pace" ? TIME_STEPS : undefined
            }
            lowerIsBetter={metric === "best_pace"}
            best={BAR_METRICS.has(metric) ? undefined : metric === "best_pace" ? "low" : "high"}
          />
          {type === "reps_only" || type === "bodyweight_reps" ? (
            <NextTimeLine
              sessions={sessions}
              exerciseId={exerciseId}
              type={type}
              equipment={equipment}
              settings={{ weightUnit: unit, weightIncrementKg, progressionPerSet }}
            />
          ) : null}
        </>
      )}
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("exercise__records")}
          </Text>
          <Button
            size="sm"
            variant="tertiary"
            accessibilityLabel={t("exercise__records_help_title")}
            onPress={() => setHelp(true)}
          >
            <Button.Label>{t("exercise__records_help_symbol")}</Button.Label>
          </Button>
        </View>
        {years.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {([null, ...years] satisfies (number | null)[]).map((value) => (
              <Button
                key={value ?? "all"}
                size="sm"
                variant={value === activeYear ? "primary" : "tertiary"}
                accessibilityState={{ selected: value === activeYear }}
                onPress={() => setYear(value)}
              >
                <Button.Label>
                  {value === null ? t("exercise__records_all_time") : String(value)}
                </Button.Label>
              </Button>
            ))}
          </ScrollView>
        ) : null}
        {records.length ? (
          records.map((record) => (
            <View key={record.key} className="flex-row justify-between gap-3">
              <View className="flex-1">
                <Text className="font-normal text-body text-foreground">{label(record.key)}</Text>
                <Text className="font-normal text-caption tabular-nums text-muted">
                  {date(record.date)}
                </Text>
              </View>
              <View className="items-end">
                <Text
                  className="font-normal text-body text-foreground"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {format(record.value, record.key)}
                </Text>
                {record.allTime !== null ? (
                  <Text
                    className="font-normal text-caption text-muted"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {t("exercise__records_all_time_value", {
                      value: format(record.allTime, record.key),
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text className="font-normal text-body text-muted">{t("exercise__records_empty")}</Text>
        )}
      </View>
      <BottomSheet isOpen={help} onOpenChange={setHelp}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <ScrollableSheetContent size="tall">
            <BottomSheet.Title>{t("exercise__records_help_title")}</BottomSheet.Title>
            <BottomSheet.Description>{t("exercise__records_help_intro")}</BottomSheet.Description>
            <View className="gap-4 pb-8">
              {(
                [
                  "heaviest_weight",
                  "estimated_one_rep_max",
                  "set_volume",
                  "session_volume",
                  "longest_duration",
                  "longest_distance",
                  "best_pace",
                  "reps_1",
                ] satisfies RecordKey[]
              ).map((key) => (
                <View key={key} className="gap-1">
                  <Text className="text-body font-semibold text-foreground">
                    {key === "reps_1" ? t("exercise__rep_records") : label(key)}
                  </Text>
                  <Text className="font-normal text-body text-muted">
                    {t(
                      key === "reps_1"
                        ? "exercise__help_reps"
                        : key === "heaviest_weight"
                          ? "exercise__help_weight"
                          : key === "estimated_one_rep_max"
                            ? "exercise__help_one_rm"
                            : key === "set_volume"
                              ? "exercise__help_set_volume"
                              : key === "session_volume"
                                ? "exercise__help_session_volume"
                                : key === "longest_duration"
                                  ? "exercise__help_duration"
                                  : key === "longest_distance"
                                    ? "exercise__help_distance"
                                    : "exercise__help_pace",
                    )}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollableSheetContent>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  );
}
