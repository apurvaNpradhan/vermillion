import { isCounted, sessionTotals, KG_PER_LB } from "@workspace/shared";
import { useRouter } from "expo-router";
import { DotsThreeVertical, PencilSimple } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { LineChart } from "@/platform/ui/charts/chart";
import { useStartSession, formatElapsed } from "@/session";
import { useHomeTraining } from "../use-home-training";
import { lastDoneLabel } from "../last-done";
import { doneSummary } from "@/session";
import { useWorkout } from "../use-workout";

export function WorkoutPreviewScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const ink = useThemeColor("foreground");
  const state = useWorkout(id);
  const history = useHomeTraining();
  const { start, sheet } = useStartSession();
  const [menu, setMenu] = useState(false);
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
  return (
    <>
      <ScrollPage
        back
        title={
          state.status === "ready"
            ? (state.workout.title ?? t("training__workout"))
            : t("training__workout")
        }
        actions={
          state.status === "ready" ? (
            <Button
              variant="ghost"
              accessibilityLabel={t("training__workout_menu")}
              onPress={() => setMenu(true)}
            >
              <DotsThreeVertical color={ink} />
            </Button>
          ) : undefined
        }
      >
        {state.status === "error" ? (
          <Button onPress={state.retry}>{t("training__retry")}</Button>
        ) : state.status !== "ready" ? (
          <Text className="text-body text-muted">
            {t(state.status === "loading" ? "common__loading" : "session__load_failed")}
          </Text>
        ) : (
          <>
            {history.loading ? (
              <Text className="text-body text-muted">{t("common__loading")}</Text>
            ) : history.failed ? (
              <Button variant="secondary" onPress={history.retry}>
                {t("training__retry")}
              </Button>
            ) : (
              <Text className="text-body text-muted">
                {last
                  ? t("workout__last_done", {
                      date: lastDoneLabel(
                        last.started_at,
                        new Date(),
                        i18n.language,
                        history.timezone,
                      ),
                    })
                  : t("workout__never_done")}
              </Text>
            )}
            <Button onPress={() => void start(id)}>
              <Button.Label>{t("session__start")}</Button.Label>
            </Button>
            {state.workout.note ? (
              <Text className="text-body text-muted">{state.workout.note}</Text>
            ) : null}
            {!history.loading && !history.failed && sessions.length ? (
              <View className="gap-3">
                <View className="flex-row flex-wrap gap-2">
                  {(["volume", "reps", "duration"] satisfies (typeof metric)[]).map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={metric === value ? "secondary" : "tertiary"}
                      accessibilityState={{ selected: metric === value }}
                      onPress={() => setMetric(value)}
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
                <LineChart
                  points={points}
                  label={label}
                  formatValue={metric === "duration" ? formatElapsed : number}
                />
              </View>
            ) : null}
            <View className="gap-3">
              {state.workout.exercises.map((entry) => {
                const previous = history.sessions.find((s) =>
                  s.sets.some((set) => set.exercise_id === entry.exerciseId),
                );
                const sets =
                  previous?.sets.flatMap((set) =>
                    set.exercise_id === entry.exerciseId && isCounted(set) ? [set] : [],
                  ) ?? [];
                return (
                  <View key={entry.id} className="gap-1 rounded-xl bg-surface p-4">
                    <Text className="text-title-md text-foreground">
                      {entry.exercise?.title ?? t("training__workout")}
                    </Text>
                    <Text className="text-caption text-muted">
                      {t("stats__sets", { count: entry.sets.length })}
                    </Text>
                    {sets.length ? (
                      <Text className="text-body text-muted">
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
                            history.weightUnit,
                            t(
                              history.weightUnit === "lb"
                                ? "training__unit_lb"
                                : "training__unit_kg",
                            ),
                          ),
                        })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollPage>
      {sheet}
      <ActionSheet
        isOpen={menu}
        onOpenChange={setMenu}
        title={t("training__workout")}
        actions={[
          {
            key: "edit",
            label: t("session__edit"),
            icon: PencilSimple,
            onPress: () => router.push({ pathname: "/train/workout/[id]/edit", params: { id } }),
          },
        ]}
      />
    </>
  );
}
