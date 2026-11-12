import { type Equipment, KG_PER_LB, type RecordKey, type WeightUnit } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { LineChart, BarChart } from "@/platform/ui/charts/chart";
import { ExerciseProgress, NextTimeLine } from "./exercise-progress";
import { datedRecords, metricSeries, metricsFor, type Metric } from "../numbers";

const LABELS = {
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
  sessions,
  exerciseId,
  type,
  bodyweightKg,
  unit,
  timezone,
  equipment,
  weightIncrementKg,
}: {
  sessions: FinishedSession[];
  exerciseId: string;
  type: Parameters<typeof metricsFor>[0];
  bodyweightKg: number | null;
  unit: WeightUnit;
  timezone: string | null;
  equipment: Equipment;
  weightIncrementKg: number | null;
}) {
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
      : t(LABELS[isMetricLabel(key) ? key : "total_reps"]);
  const format = (value: number, key: Metric) => {
    if (key === "longest_duration") return t("exercise__value_seconds", { value: number(value) });
    if (key === "longest_distance") return t("exercise__value_metres", { value: number(value) });
    if (key === "best_pace") return t("exercise__value_pace", { value: number(value) });
    if (key === "total_reps" || key === "floors" || key === "steps") return number(value);
    return t(
      key === "set_volume" || key === "session_volume"
        ? "exercise__value_volume"
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
  return (
    <View className="gap-6 px-4">
      {type === "weight_reps" ? (
        <ExerciseProgress
          sessions={sessions}
          exerciseId={exerciseId}
          type={type}
          equipment={equipment}
          settings={{ weightUnit: unit, weightIncrementKg }}
          timezone={timezone}
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
          {bodyweightKg === null &&
          (type === "bodyweight_reps" || type === "bodyweight_assisted_reps") ? (
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
              settings={{ weightUnit: unit, weightIncrementKg }}
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
          <BottomSheet.Content
            snapPoints={["80%"]}
            backgroundClassName="bg-overlay"
            contentContainerClassName="px-4 pb-8 gap-4"
          >
            <BottomSheet.Title>{t("exercise__records_help_title")}</BottomSheet.Title>
            <BottomSheet.Description>{t("exercise__records_help_intro")}</BottomSheet.Description>
            <ScrollView contentContainerClassName="gap-4 pb-8">
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
            </ScrollView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  );
}
