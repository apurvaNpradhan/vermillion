import { useWeight, WeightTrendCard } from "@/body";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { HabitGrid } from "@/platform/ui/habit-grid";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SectionHeader } from "@/platform/ui/section-header";
import { FadeIn } from "@/platform/ui/fade-in";
import { formatElapsed, useActiveSessions, useStartSession } from "@/session";
import { KG_PER_LB, sessionGoal, sessionTotals, type SessionHistory } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import {
  comparableWeekSessions,
  ratioChange,
  trailingDays,
  weekCells,
  weighInsInWeek,
} from "./home-stats";
import { lastDoneLabel } from "./last-done";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useHomeTraining } from "./use-home-training";
import { useWorkout } from "@/training/workouts/use-workout";
import { useWorkoutRecency } from "@/training/train/use-workout-recency";
import { slotTitle } from "@/training/rotation/rotation-row";
import { LighterWeekCard } from "./lighter-week-card";
import { MusclesTile } from "@/training/muscles/muscles-tile";

const HABIT_DAYS = 30;

/** Home: the next workout, the week, two habit grids, the weight trend and the last Session. */
export function TrainingHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { start, sheet } = useStartSession();
  const state = useHomeTraining();
  const weight = useWeight();
  const active = useActiveSessions();
  const programState = useActiveProgram();
  const recency = useWorkoutRecency();
  const next = programState.program?.slots.find(
    (slot) => slot.id === programState.progress.next?.id,
  );
  const recent = recency.value?.[0];
  const workoutId = next?.workoutId ?? recent?.id ?? null;
  const workout = useWorkout(workoutId ?? "");
  // One ready state for the whole screen: every part appears together.
  const loading =
    state.loading ||
    weight.loading ||
    active.loading ||
    !programState.ready ||
    recency.loading ||
    (workoutId !== null && workout.status === "loading");
  const failed = state.failed || weight.failed;
  const retry = () => {
    state.retry();
    weight.retry();
  };

  if (failed) {
    return (
      <Button variant="secondary" onPress={retry}>
        <Button.Label>{t("training__retry")}</Button.Label>
      </Button>
    );
  }
  // Everything here is on the device, so it lands in milliseconds: nothing is drawn until then.
  if (loading) return null;

  const resume = active.sessions[0];
  const now = new Date();
  const zone = state.timezone;
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(value);
  const volume = (kg: number) =>
    t("home__volume_value", {
      value: number(state.weightUnit === "lb" ? kg / KG_PER_LB : kg),
      unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
    });
  const totalsOf = (sessions: readonly SessionHistory[]) =>
    sessionTotals(
      sessions.flatMap((session) => session.sets),
      state.bodyweightKg,
    );

  // ---- Next workout ----
  const slots = programState.program?.slots ?? [];
  const nextIndex = next ? slots.findIndex((slot) => slot.id === next.id) : -1;
  const exercises = workout.status === "ready" ? workout.workout.exercises.length : 0;
  const lastDone = recency.value?.find((item) => item.id === workoutId);
  const nextTitle = resume?.title ?? (next ? slotTitle(next, t) : recent?.title);
  const nextLine = resume
    ? t("home__in_progress")
    : lastDone
      ? t("home__next_summary", {
          count: exercises,
          date: new Intl.DateTimeFormat(i18n.language, {
            day: "numeric",
            month: "short",
            timeZone: zone,
          }).format(new Date(lastDone.lastDone)),
        })
      : t("home__next_summary_new", { count: exercises });

  // ---- This week ----
  const { weekStart } = state;
  const { current: thisWeek, previous: lastWeek } = comparableWeekSessions(
    state.sessions,
    now,
    zone,
    weekStart,
  );
  const weekTotals = totalsOf(thisWeek);
  const volumeChange = ratioChange(weekTotals.volume, totalsOf(lastWeek).volume);
  const cells = weekCells(
    thisWeek.map((session) => session.started_at),
    now,
    zone,
    weekStart,
  );
  const weekdayLetter = (day: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "narrow", timeZone: "UTC" }).format(day);
  const goal = sessionGoal(programState.program, state.sessionsPerWeek);

  // ---- Habit grids ----
  const trained = trailingDays(
    state.sessions.map((session) => session.started_at),
    now,
    zone,
    HABIT_DAYS,
  );
  const trainedCount = trained.filter(Boolean).length;
  const weighIns = weight.days.map((day) => day.logged);
  const weighInCount = weighIns.filter(Boolean).length;
  const weighInWeek = weighInsInWeek(weight.days, now, zone, weekStart);

  // ---- Last session ----
  const last = state.recent[0];
  const lastTotals = last ? totalsOf([last]) : null;

  return (
    <FadeIn className="gap-6">
      <View className="gap-3 rounded-2xl bg-surface p-4">
        <Text className="text-caption font-medium text-identity">
          {next && !resume
            ? t("home__next_day", { day: nextIndex + 1, total: slots.length })
            : t("home__next_workout")}
        </Text>
        {resume || workout.status === "ready" ? (
          <>
            <View className="gap-1">
              <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
                {nextTitle}
              </Text>
              <Text numberOfLines={1} className="text-caption text-muted">
                {nextLine}
              </Text>
            </View>
            <Button
              className="w-full"
              onPress={() =>
                resume
                  ? router.push({ pathname: "/session/[id]", params: { id: resume.id } })
                  : void start(workoutId)
              }
            >
              <Button.Label>{t(resume ? "session__resume" : "session__start")}</Button.Label>
            </Button>
          </>
        ) : (
          <Button className="w-full" onPress={() => void start(null)}>
            <Button.Label>{t("home__start_empty")}</Button.Label>
          </Button>
        )}
      </View>

      <View className="gap-3 rounded-2xl bg-surface p-4">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("home__week")}
          </Text>
          <Text className="text-caption tabular-nums text-muted">
            {goal !== null
              ? t("home__week_progress", { done: thisWeek.length, total: goal })
              : t("stats__sessions", { count: thisWeek.length })}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={t("home__week_strip_label", {
            count: cells.filter((cell) => cell.trained).length,
          })}
          className="flex-row gap-1.5"
        >
          {cells.map((cell) => (
            <View key={cell.day} className="flex-1 items-center gap-1">
              <View
                className={`aspect-square w-full rounded-md ${
                  cell.trained ? "bg-identity" : "bg-default"
                } ${cell.today ? "border-2 border-foreground" : ""}`}
              />
              <Text className="text-caption text-muted">{weekdayLetter(cell.day)}</Text>
            </View>
          ))}
        </View>
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-caption tabular-nums text-muted">
            {t("home__week_totals", {
              sets: t("stats__sets", { count: weekTotals.sets }),
              volume: volume(weekTotals.volume),
            })}
          </Text>
          {volumeChange === null ? null : (
            <Text className="text-caption tabular-nums text-muted">
              {t("home__delta", {
                value: new Intl.NumberFormat(i18n.language, {
                  style: "percent",
                  maximumFractionDigits: 0,
                  signDisplay: "exceptZero",
                }).format(volumeChange),
              })}
            </Text>
          )}
        </View>
      </View>

      <LighterWeekCard state={state} />

      <MusclesTile program={programState.program} />

      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home__training_tile", { count: trainedCount })}
          onPress={() => router.push("/history")}
          className="flex-1 gap-3 rounded-2xl bg-surface p-4 active:bg-default"
        >
          <View>
            <Text className="text-caption font-medium text-foreground">{t("home__training")}</Text>
            <Text className="text-caption text-muted">{t("home__last_month")}</Text>
          </View>
          <HabitGrid
            cells={trained}
            tone="accent"
            label={t("home__training_tile", { count: trainedCount })}
          />
          <View className="flex-row items-baseline gap-1">
            <Text className="text-numeric-md tabular-nums text-foreground">{trainedCount}</Text>
            <Text className="text-caption text-muted">
              {t("home__sessions_unit", { count: trainedCount })}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("body__habit_count", { count: weighInCount })}
          onPress={() => router.push("/body/weight")}
          className="flex-1 gap-3 rounded-2xl bg-surface p-4 active:bg-default"
        >
          <View>
            <Text className="text-caption font-medium text-foreground">{t("home__weigh_in")}</Text>
            <Text className="text-caption text-muted">{t("home__last_month")}</Text>
          </View>
          <HabitGrid
            cells={weighIns}
            tone="success"
            label={t("body__habit_count", { count: weighInCount })}
          />
          <View className="flex-row items-baseline gap-1">
            <Text className="text-numeric-md tabular-nums text-foreground">{weighInWeek}/7</Text>
            <Text className="text-caption text-muted">{t("home__this_week_unit")}</Text>
          </View>
        </Pressable>
      </View>

      <WeightTrendCard weight={weight} />

      {last && lastTotals ? (
        <View className="gap-1">
          <SectionHeader
            title={t("home__last_session")}
            actionLabel={t("home__history")}
            onAction={() => router.push("/history")}
          />
          <ListSection variant="plain">
            <ListRow
              title={last.title}
              description={t("home__last_session_meta", {
                date: lastDoneLabel(last.started_at, now, i18n.language, zone, "leading"),
                duration: formatElapsed(
                  last.durationS ??
                    (Date.parse(last.finished_at ?? last.started_at) -
                      Date.parse(last.started_at)) /
                      1000,
                ),
                volume: volume(lastTotals.volume),
              })}
              onPress={() =>
                router.push(
                  { pathname: "/history/[id]", params: { id: last.id } },
                  { withAnchor: true },
                )
              }
            />
          </ListSection>
        </View>
      ) : null}
      {sheet}
    </FadeIn>
  );
}
