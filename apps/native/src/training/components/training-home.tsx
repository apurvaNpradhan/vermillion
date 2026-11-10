import { KG_PER_LB, muscleDistribution } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { BarChart } from "@/platform/ui/charts/chart";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { useActiveSessions, useStartSession } from "@/session";
import { useHomeTraining } from "../use-home-training";
import { ActiveProgramCard } from "./active-program-card";

export function TrainingHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { start, sheet } = useStartSession();
  const state = useHomeTraining();
  const active = useActiveSessions();
  const current = state.buckets[7];
  const last = state.buckets[6];
  const weekSets = current?.items.flatMap((s) => s.sets) ?? [];
  const hasMuscles = muscleDistribution(weekSets, state.exercises).length > 0;
  const format = (n: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(n);
  const volume = (kg: number) =>
    t("home__volume_value", {
      value: format(state.weightUnit === "lb" ? kg / KG_PER_LB : kg),
      unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
    });
  return (
    <View className="gap-5">
      {active.sessions.map((session) => (
        <Button
          key={session.id}
          variant="secondary"
          onPress={() => router.push({ pathname: "/session/[id]", params: { id: session.id } })}
        >
          <Button.Label>{t("home__resume", { title: session.title })}</Button.Label>
        </Button>
      ))}
      <ActiveProgramCard />
      {state.failed ? (
        <Button variant="secondary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      {!state.loading &&
      !state.failed &&
      state.sessions.length === 0 &&
      active.sessions.length === 0 ? (
        <Button onPress={() => void start(null)}>
          <Button.Label>{t("home__first")}</Button.Label>
        </Button>
      ) : null}
      {current && last && current.items.length > 0 ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          <Text className="text-title-md font-semibold text-foreground">{t("home__week")}</Text>
          <Text className="text-body text-muted">
            {t("home__comparison", {
              sessions: current.items.length,
              sets: current.sets,
              volume: volume(current.volume),
              lastSessions: last.items.length,
              lastSets: last.sets,
              lastVolume: volume(last.volume),
            })}
          </Text>
          <BarChart points={state.buckets} label={t("home__volume")} formatValue={format} />
          {hasMuscles ? (
            <View className="gap-3">
              <Text className="text-title-md font-semibold text-foreground">
                {t("home__muscles")}
              </Text>
              <MuscleDistribution sets={weekSets} exercises={state.exercises} />
            </View>
          ) : null}
        </View>
      ) : null}
      {state.sessions.length > 0 ? (
        <View className="gap-2">
          <Text className="text-title-md font-semibold text-foreground">{t("home__recent")}</Text>
          {state.sessions.slice(0, 3).map((s) => (
            <Button
              key={s.id}
              variant="secondary"
              onPress={() => router.push({ pathname: "/history/[id]", params: { id: s.id } })}
            >
              <Button.Label>{s.title}</Button.Label>
            </Button>
          ))}
          <Button variant="tertiary" onPress={() => router.push("/history")}>
            <Button.Label>{t("home__see_all")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {sheet}
    </View>
  );
}
