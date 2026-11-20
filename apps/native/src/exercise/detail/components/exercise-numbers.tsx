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
import { ExerciseProgress, NextTimeLine } from "./exercise-progress";
import { datedRecords, metricSeries, metricsFor, type Metric } from "../numbers";

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

function isMetricLabel(key: Metric): key is keyof typeof LABELS {
  return key in LABELS;
}

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
  const metrics = metricsFor(type);
  const [selected, setSelected] = useState<Metric>(metrics[0] ?? "total_reps");
  const metric = metrics.includes(selected) ? selected : (metrics[0] ?? "total_reps");
  const [help, setHelp] = useState(false);
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
    if (key === "longest_duration") return t("exercise__value_seconds", { value: number(value) });
    if (key === "longest_distance") return t("exercise__value_metres", { value: number(value) });
    if (key === "best_pace") return t("exercise__value_pace", { value: number(value) });
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
  const points = metricSeries(sessions, exerciseId, metric, bodyweightKg).map((p) => ({
    ...p,
    label: date(p.x),
  }));
  const records = datedRecords(sessions, exerciseId, bodyweightKg);
  const Chart =
    metric === "total_reps" || metric === "floors" || metric === "steps" ? BarChart : LineChart;
  // Volume and the estimated one-rep max of these types need a bodyweight to be right.
  const needsBodyweight =
    bodyweightKg === null &&
    weight.entries.length === 0 &&
    (type === "bodyweight_reps" || type === "bodyweight_assisted_reps" || addsLoad(type));
  return (
    <View className="gap-6 px-4">
      {addsLoad(type) && needsBodyweight ? (
        <Text className="text-caption text-muted">{t("exercise__bodyweight_hint")}</Text>
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
            <Text className="text-caption text-muted">{t("exercise__bodyweight_hint")}</Text>
          ) : null}
          <Chart
            points={points}
            label={label(metric)}
            formatValue={(value) => format(value, metric)}
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
        {records.length ? (
          records.map((record) => (
            <View key={record.key} className="flex-row justify-between gap-3">
              <View className="flex-1">
                <Text className="text-body text-foreground">{label(record.key)}</Text>
                <Text className="text-caption text-muted">{date(record.date)}</Text>
              </View>
              <Text className="text-body text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
                {format(record.value, record.key)}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-body text-muted">{t("exercise__records_empty")}</Text>
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
                  <Text className="text-body text-muted">
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
