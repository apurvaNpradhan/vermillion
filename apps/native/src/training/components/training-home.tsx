import { Skeleton } from "@/platform/ui/skeleton";
import { KG_PER_LB, muscleDistribution, sessionTotals } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { StatTiles } from "@/platform/ui/stat-tiles";
import { formatElapsed } from "@/session";
import { Button } from "@/platform/ui/button";
import { BarChart } from "@/platform/ui/charts/chart";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { useActiveSessions, useStartSession } from "@/session";
import { useHomeTraining } from "../use-home-training";
import { useActiveProgram } from "../use-active-program";
import { ActiveProgramCard } from "./active-program-card";

export function TrainingHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { start, sheet } = useStartSession();
  const state = useHomeTraining();
  const active = useActiveSessions();
  const programState = useActiveProgram();
  // One ready state for the whole screen: the card, the week and the recent list appear together.
  const loading = state.loading || !programState.ready;
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
    t("home__volume_value", {
      value: format(state.weightUnit === "lb" ? kg / KG_PER_LB : kg),
      unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
    });
  return (
    <View className="gap-5">
      {loading ? null : <ActiveProgramCard state={programState} />}
      {loading ? (
        <Skeleton label={t("common__loading")} className="h-40 w-full rounded-2xl" />
      ) : null}
      {state.failed ? (
        <Button variant="secondary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      {!loading && !state.failed && state.recent.length === 0 && active.sessions.length === 0 ? (
        <Button onPress={() => void start(null)}>
          <Button.Label>{t("home__first")}</Button.Label>
        </Button>
      ) : null}
      {!loading && current && last && current.items.length > 0 ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          <Text className="text-title-md font-semibold text-foreground">{t("home__week")}</Text>
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
                detail: t("home__delta", { value: volumeDelta(current.volume - last.volume) }),
              },
            ]}
          />
          <BarChart
            showRanges={false}
            points={state.buckets}
            label={t("home__volume")}
            formatValue={format}
          />
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
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-title-md font-semibold text-foreground">{t("home__recent")}</Text>
            <Button variant="tertiary" onPress={() => router.push("/history")}>
              <Button.Label>{t("home__see_all")}</Button.Label>
            </Button>
          </View>
          <ListSection>
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
