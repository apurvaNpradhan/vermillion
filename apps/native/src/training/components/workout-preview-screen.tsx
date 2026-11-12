import { haptic } from "@/platform/haptics";
import { isCounted, sessionTotals, KG_PER_LB } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Note, Timer } from "phosphor-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ExerciseHeading } from "@/exercise";
import { SectionHeader } from "@/platform/ui/section-header";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { LineChart } from "@/platform/ui/charts/chart";
import { usePreviousSets, useStartSession, formatElapsed } from "@/session";
import { useHomeTraining } from "../use-home-training";
import { lastDoneLabel } from "../last-done";
import { doneSummary } from "@/session";
import { useWorkout } from "../use-workout";
import { usePreferences } from "@/preferences";
import { formatClock } from "../rest";
import { plannedColumns, plannedRows } from "../set-text-rows";
import { chipTexts } from "../set-editing";
import { useColumnHeaders } from "../use-column-headers";
import { SetTextTable } from "./set-text-table";

export function WorkoutPreviewScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const columnHeader = useColumnHeaders();
  const { preferences } = usePreferences();
  const state = useWorkout(id);
  const history = useHomeTraining(id);
  const previousHistory = usePreviousSets(
    state.status === "ready" ? state.workout.exercises.map((entry) => entry.exerciseId) : [],
  );
  const { start, sheet } = useStartSession();
  const [metric, setMetric] = useState<"volume" | "reps" | "duration">("volume");
  const sessions = history.sessions.filter((s) => s.workoutId === id);
  const last = sessions[0];
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: history.timezone,
    }).format(new Date(value));
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(value);
  const label = t(
    metric === "volume" ? "stats__volume" : metric === "reps" ? "workout__reps" : "stats__duration",
  );
  const points = [...sessions].reverse().map((s) => ({
    id: s.id,
    x: Date.parse(s.started_at),
    label: date(s.started_at),
    y:
      metric === "duration"
        ? (s.durationS ??
          (Date.parse(s.finished_at ?? s.started_at) - Date.parse(s.started_at)) / 1000)
        : metric === "reps"
          ? s.sets.reduce((sum, set) => sum + (isCounted(set) ? (set.reps ?? 0) : 0), 0)
          : sessionTotals(s.sets, history.bodyweightKg).volume /
            (history.weightUnit === "lb" ? KG_PER_LB : 1),
  }));
  const unit = history.weightUnit;
  const unitLabel = t(unit === "lb" ? "training__unit_lb" : "training__unit_kg");
  const shortDate = (at: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      day: "numeric",
      timeZone: history.timezone,
    }).format(new Date(at));
  const lastText = last
    ? t("workout__last_done", {
        date: lastDoneLabel(last.started_at, new Date(), i18n.language, history.timezone),
      })
    : t("workout__never_done");
  const ready = state.status === "ready" ? state.workout : null;
  return (
    <>
      <ScrollPage
        back
        title={ready ? (ready.title ?? t("training__workout")) : t("training__workout")}
      >
        {state.status === "error" ? (
          <Button onPress={state.retry}>{t("training__retry")}</Button>
        ) : !ready ? (
          <Text className="text-body text-muted">
            {t(state.status === "loading" ? "common__loading" : "session__load_failed")}
          </Text>
        ) : (
          <View className="gap-8">
            <View className="gap-4">
              {history.failed ? (
                <Button variant="secondary" onPress={history.retry}>
                  {t("training__retry")}
                </Button>
              ) : (
                <Text className="text-body text-muted">
                  {history.loading
                    ? t("common__loading")
                    : t("workout__subtitle", {
                        exercises: t("workout__exercise_count", { count: ready.exercises.length }),
                        last: lastText,
                      })}
                </Text>
              )}
              <Button onPress={() => void start(id)}>
                <Button.Label>{t("session__start")}</Button.Label>
              </Button>
              {ready.note ? <Text className="text-body text-muted">{ready.note}</Text> : null}
            </View>
            {!history.loading && !history.failed && sessions.length ? (
              <LineChart
                points={points}
                label={label}
                formatValue={metric === "duration" ? formatElapsed : number}
                readout={(point) =>
                  `${
                    metric === "duration"
                      ? formatElapsed(point.y)
                      : metric === "volume"
                        ? `${number(point.y)} ${unitLabel}`
                        : number(point.y)
                  } · ${shortDate(point.x)}`
                }
                footer={
                  <View className="flex-row flex-wrap gap-2">
                    {(["volume", "reps", "duration"] satisfies (typeof metric)[]).map((value) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={metric === value ? "secondary" : "tertiary"}
                        accessibilityState={{ selected: metric === value }}
                        onPress={() => {
                          if (metric !== value) haptic.tick();
                          setMetric(value);
                        }}
                      >
                        <Button.Label>
                          {t(
                            value === "volume"
                              ? "stats__volume"
                              : value === "reps"
                                ? "workout__reps"
                                : "stats__duration",
                          )}
                        </Button.Label>
                      </Button>
                    ))}
                  </View>
                }
              />
            ) : null}
            <View className="gap-2">
              <SectionHeader
                title={t("workout__exercises")}
                actionLabel={t("session__edit")}
                onAction={() =>
                  router.push({ pathname: "/train/workout/[id]/edit", params: { id } })
                }
              />
              {ready.exercises.map((entry) => {
                const previous = previousHistory.history.get(entry.exerciseId)?.[0];
                const sets =
                  previous?.sets.flatMap((set) =>
                    set.exercise_id === entry.exerciseId && isCounted(set) ? [set] : [],
                  ) ?? [];
                const type = entry.exercise?.exerciseType ?? "weight_reps";
                const columns = plannedColumns(type, entry.sets);
                const scale = preferences.ui.effortScale;
                const rows = plannedRows(
                  entry.sets,
                  chipTexts(entry.sets, {
                    working: "",
                    warmup: t("training__chip_warmup"),
                    drop: t("training__chip_drop"),
                    failure: t("training__chip_failure"),
                    top: t("training__chip_top"),
                    backoff: t("training__chip_backoff"),
                    myo: t("training__chip_myo"),
                  }),
                  columns,
                  unit,
                  scale,
                );
                return (
                  <View key={entry.id} className="gap-1 py-2">
                    <ExerciseHeading
                      title={entry.exercise?.title ?? t("training__workout")}
                      thumbnailKey={entry.exercise?.thumbnailKey ?? null}
                      muscle={entry.exercise?.primaryMuscle ?? "chest"}
                      onPress={() =>
                        router.push({
                          pathname: "/exercises/[id]",
                          params: { id: entry.exerciseId },
                        })
                      }
                    />
                    {entry.restSeconds !== null ? (
                      <View className="min-h-8 flex-row items-center gap-2 px-1">
                        <Timer size={16} color={subtle} />
                        <Text className="text-caption text-muted tabular-nums">
                          {t("training__rest_link", { value: formatClock(entry.restSeconds) })}
                        </Text>
                      </View>
                    ) : null}
                    {entry.note ? (
                      <View className="min-h-8 flex-row items-start gap-2 px-1">
                        <Note size={16} color={subtle} />
                        <Text className="flex-1 text-caption text-muted">{entry.note}</Text>
                      </View>
                    ) : null}
                    <SetTextTable
                      headers={columns.map((column) => columnHeader(column, unit, scale))}
                      rows={rows}
                    />
                    {sets.length ? (
                      <Text className="px-1 text-caption text-muted">
                        {t("workout__previous", {
                          values: doneSummary(
                            sets.map((set) => ({
                              kind: set.kind,
                              completedAt: set.completed_at,
                              weightKg: set.weight_kg ?? null,
                              reps: set.reps ?? null,
                              durationS: set.duration_s ?? null,
                              distanceM: set.distance_m ?? null,
                              floors: set.floors ?? null,
                              steps: set.steps ?? null,
                            })),
                            sets[0]?.exercise_type ?? "weight_reps",
                            unit,
                            unitLabel,
                          ),
                        })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollPage>
      {sheet}
    </>
  );
}
