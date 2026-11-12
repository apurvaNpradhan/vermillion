import { Skeleton } from "@/platform/ui/skeleton";
import { KG_PER_LB, muscleDistribution, sessionTotals } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SectionHeader } from "@/platform/ui/section-header";
import { StatTiles } from "@/platform/ui/stat-tiles";
import { formatElapsed } from "@/session";
import { Button } from "@/platform/ui/button";
import { BarChart } from "@/platform/ui/charts/chart";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { useActiveSessions, useStartSession } from "@/session";
import { useHomeTraining } from "../use-home-training";
import { useActiveProgram } from "../use-active-program";
import { useWorkoutRecency } from "../use-workout-recency";
import { useWorkout } from "../use-workout";
import { slotTitle } from "./rotation-row";

export function TrainingHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { start, sheet } = useStartSession();
  const state = useHomeTraining();
  const active = useActiveSessions();
  const programState = useActiveProgram();
  // One ready state for the whole screen: the card, the week and the recent list appear together.
  const recency = useWorkoutRecency();
  const loading = state.loading || !programState.ready || recency.loading;
  const next = programState.program?.slots.find(
    (slot) => slot.id === programState.progress.next?.id,
  );
  const recent = recency.value?.[0];
  const workoutId = next?.workoutId ?? recent?.id ?? null;
  const workout = useWorkout(workoutId ?? "");
  const resume = active.sessions[0];
  const lastDone = recency.value?.find((workout) => workout.id === workoutId);
  const current = state.buckets[7];
  const last = state.buckets[6];
  const weekSets = current?.items.flatMap((s) => s.sets) ?? [];
  const hasMuscles = muscleDistribution(weekSets, state.exercises).length > 0;
  const format = (n: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(n);
  const delta = (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 0,
      signDisplay: "exceptZero",
    }).format(n);
  const volumeDelta = (kg: number) =>
    t("home__volume_value", {
      value: delta(state.weightUnit === "lb" ? kg / KG_PER_LB : kg),
      unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
    });
  const volume = (kg: number) =>
    kg <= 0
      ? "—"
      : t("home__volume_value", {
          value: format(state.weightUnit === "lb" ? kg / KG_PER_LB : kg),
          unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
        });
  return (
    <View className="gap-8">
      {!loading && !active.loading && !state.failed ? (
        <View className="gap-2 border-b border-separator pb-5">
          <Text className="text-caption text-muted">{t("home__next_workout")}</Text>
          {resume || workout.status === "ready" ? (
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
                  {resume?.title ?? (next ? slotTitle(next, t) : recent?.title)}
                </Text>
                <Text numberOfLines={1} className="text-caption text-muted">
                  {resume
                    ? t("home__in_progress")
                    : t("home__next_summary", {
                        count: workout.status === "ready" ? workout.workout.exercises.length : 0,
                        date: lastDone
                          ? new Intl.DateTimeFormat(i18n.language, {
                              dateStyle: "medium",
                              timeZone: state.timezone,
                            }).format(new Date(lastDone.lastDone))
                          : t("home__never_done"),
                      })}
                </Text>
              </View>
              <Button
                size="sm"
                className="rounded-full"
                onPress={() =>
                  resume
                    ? router.push({ pathname: "/session/[id]", params: { id: resume.id } })
                    : void start(workoutId)
                }
              >
                <Button.Label>{t(resume ? "session__resume" : "session__start")}</Button.Label>
              </Button>
            </View>
          ) : workoutId && workout.status === "loading" ? null : (
            <Button onPress={() => void start(null)}>
              <Button.Label>{t("home__start_empty")}</Button.Label>
            </Button>
          )}
        </View>
      ) : null}
      {loading ? (
        <Skeleton label={t("common__loading")} className="h-40 w-full rounded-2xl" />
      ) : null}
      {state.failed ? (
        <Button variant="secondary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      {!loading && current && last && current.items.length > 0 ? (
        <View className="gap-4">
          <SectionHeader title={t("home__week")} />
          <StatTiles
            items={[
              {
                label: t("stats__sessions"),
                value: format(current.items.length),
                detail: t("home__delta", {
                  value: delta(current.items.length - last.items.length),
                }),
              },
              {
                label: t("stats__sets"),
                value: format(current.sets),
                detail: t("home__delta", { value: delta(current.sets - last.sets) }),
              },
              {
                label: t("stats__volume"),
                value: volume(current.volume),
                detail:
                  current.volume === 0 && last.volume === 0
                    ? undefined
                    : t("home__delta", { value: volumeDelta(current.volume - last.volume) }),
              },
            ]}
          />
          {state.buckets.some((bucket) => bucket.y > 0) ? (
            <BarChart
              showRanges={false}
              points={state.buckets}
              label={t("home__volume")}
              formatValue={format}
            />
          ) : null}
          {hasMuscles ? (
            <View className="gap-3">
              <MuscleDistribution
                preview
                title={t("home__muscles")}
                sets={weekSets}
                exercises={state.exercises}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {!loading && state.recent.length > 0 ? (
        <View className="gap-1">
          <SectionHeader
            title={t("home__recent")}
            actionLabel={t("home__see_all")}
            onAction={() => router.push("/history")}
          />
          <ListSection variant="plain">
            {state.recent.map((s) => {
              const totals = sessionTotals(s.sets, state.bodyweightKg);
              return (
                <ListRow
                  key={s.id}
                  title={s.title}
                  description={t("home__recent_meta", {
                    date: new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: "medium",
                      timeZone: state.timezone,
                    }).format(new Date(s.started_at)),
                    duration: formatElapsed(
                      s.durationS ??
                        (Date.parse(s.finished_at ?? s.started_at) - Date.parse(s.started_at)) /
                          1000,
                    ),
                    sets: t("stats__sets", { count: totals.sets }),
                    volume: volume(totals.volume),
                  })}
                  onPress={() =>
                    router.push(
                      { pathname: "/history/[id]", params: { id: s.id } },
                      { withAnchor: true },
                    )
                  }
                />
              );
            })}
          </ListSection>
        </View>
      ) : null}
      {sheet}
    </View>
  );
}
