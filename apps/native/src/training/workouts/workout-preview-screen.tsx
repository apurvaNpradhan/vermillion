import { haptic } from "@/platform/haptics";
import {
  historyForWorkout,
  isCounted,
  sessionDurationSeconds,
  sessionTotals,
  stalledSessions,
  KG_PER_LB,
} from "@workspace/shared";
import { useRouter } from "expo-router";
import { Note, PencilSimple, ShareNetwork, Timer } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { useThemeColor } from "heroui-native";
import { ExerciseHeading, StalledNote, stallMemory, useStallVersion } from "@/exercise";
import { SectionHeader } from "@/platform/ui/section-header";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { LineChart } from "@/platform/ui/charts/chart";
import { useGymLoads } from "@/gym";
import { usePreviousSets, useStartSession, formatElapsed, previewProgression } from "@/session";
import { useHomeTraining } from "@/training/home/use-home-training";
import { lastDoneLabel } from "@/platform/last-done";
import { doneSummary } from "@/session";
import { useWorkout } from "./use-workout";
import { displayTitle } from "./derived-title";
import { WorkoutTile } from "@/training/shared/workout-tile";
import { RenameWorkoutSheet } from "./rename-workout-sheet";
import { useWorkoutActions } from "./use-workout-actions";
import { usePreferences } from "@/preferences";
import { formatClock } from "@/training/targets/rest";
import { plannedColumns, plannedRows } from "@/training/sets/set-text-rows";
import { chipTexts } from "@/training/sets/set-editing";
import { useColumnHeaders } from "@/training/sets/use-column-headers";
import { SetTextTable } from "@/training/sets/set-text-table";
import { WorkoutProgressionPreview } from "./workout-progression-preview";
import { ANCHORED } from "@/platform/navigation/anchored";

export function WorkoutPreviewScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const foreground = useThemeColor("foreground");
  const columnHeader = useColumnHeaders();
  const { preferences, isLoading: preferencesLoading } = usePreferences();
  const gym = useGymLoads();
  const state = useWorkout(id);
  const history = useHomeTraining(id);
  const previousHistory = usePreviousSets(
    state.status === "ready" ? state.workout.exercises.map((entry) => entry.exerciseId) : [],
  );
  const stallVersion = useStallVersion();
  const { start, sheet } = useStartSession();
  const [metric, setMetric] = useState<"volume" | "reps" | "duration">("volume");
  const [renaming, setRenaming] = useState(false);
  const [renameBaseline, setRenameBaseline] = useState<string | null>(null);
  const actions = useWorkoutActions();
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
        ? sessionDurationSeconds(
            {
              durationS: s.durationS,
              startedAt: s.started_at,
              finishedAt: s.finished_at ?? s.started_at,
              pausedMs: s.pausedMs,
            },
            0,
          )
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
  const shownTitle = ready
    ? displayTitle(
        ready.title,
        ready.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise.primaryMuscle] : [])),
        (key) => t(key),
      )
    : t("training__workout");
  const now = new Date();
  const bodyweightKg = previousHistory.bodyweightOn(now.toISOString());
  const exerciseHistory = (ready?.exercises ?? []).map((entry) => {
    const history = previousHistory.history.get(entry.exerciseId) ?? [];
    // Stalls compare this Workout across gyms. Progression uses all Sessions for its break clock.
    const stallHistory = history.filter((session) => session.workoutId === id);
    const lastSessionId = stallHistory[0]?.id ?? null;
    const type = entry.exercise?.exerciseType ?? "weight_reps";
    const count = stalledSessions(stallHistory, type, {
      bodyweightKg,
      lighterWeeks: preferences.ui.lighterWeeks,
    });
    return {
      entry,
      history,
      type,
      count,
      lastSessionId,
      memory: stallMemory(entry.exerciseId, lastSessionId),
    };
  });
  const progression =
    previousHistory.ready && !preferencesLoading
      ? exerciseHistory.flatMap(({ entry, history, count, memory }) => {
          const preview = previewProgression(
            entry,
            history,
            {
              baselineHistory: historyForWorkout(
                history,
                preferences.ui.previousSource === "same_workout" ? id : null,
              ),
              weightUnit: unit,
              weightIncrementKg: preferences.ui.weightIncrementKg,
              lighterWeeks: preferences.ui.lighterWeeks,
              deload: count > 0 && memory.applied,
              gymId: gym.gymId,
              grid: entry.exercise ? gym.gridFor(entry.exerciseId, entry.exercise.equipment) : null,
            },
            now,
          );
          return preview && entry.exercise
            ? [{ id: entry.id, title: entry.exercise.title, preview }]
            : [];
        })
      : [];
  return (
    <>
      <ScrollPage
        back
        title={shownTitle}
        onTitlePress={
          ready
            ? () => {
                setRenameBaseline(ready.title);
                setRenaming(true);
              }
            : undefined
        }
        titleHint={t("training__rename_hint")}
        actions={
          ready ? (
            <View className="flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("training__edit_workout")}
                className="h-11 w-11 items-center justify-center"
                onPress={() =>
                  router.push({ pathname: "/train/workout/[id]/edit", params: { id } })
                }
              >
                <PencilSimple size={24} color={foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("share__share")}
                className="h-11 w-11 items-center justify-center"
                onPress={() =>
                  router.push({ pathname: "/share/[kind]/[id]", params: { kind: "workout", id } })
                }
              >
                <ShareNetwork size={24} color={foreground} />
              </Pressable>
            </View>
          ) : undefined
        }
      >
        {state.status === "error" ? (
          <Button onPress={state.retry}>{t("training__retry")}</Button>
        ) : !ready ? (
          state.status === "loading" ? null : (
            <Text className="font-normal text-body text-muted">{t("session__load_failed")}</Text>
          )
        ) : (
          <View className="gap-8">
            <View className="gap-4">
              <View className="flex-row items-center gap-3">
                <WorkoutTile
                  title={shownTitle}
                  size={56}
                  coverMediaId={ready.coverMediaId}
                  exercises={ready.exercises.flatMap((entry) =>
                    entry.exercise ? [entry.exercise] : [],
                  )}
                />
                <View className="flex-1">
                  {history.failed ? (
                    <Button variant="secondary" onPress={history.retry}>
                      {t("training__retry")}
                    </Button>
                  ) : (
                    <Text className="font-normal text-body text-muted">
                      {history.loading
                        ? null
                        : t("workout__subtitle", {
                            exercises: t("workout__exercise_count", {
                              count: ready.exercises.length,
                            }),
                            last: lastText,
                          })}
                    </Text>
                  )}
                </View>
              </View>
              <Button onPress={() => void start(id)}>
                <Button.Label>{t("session__start")}</Button.Label>
              </Button>
              <WorkoutProgressionPreview
                exercises={progression}
                unit={unit}
                unitLabel={unitLabel}
              />
              {ready.note ? (
                <Text className="font-normal text-body text-muted">{ready.note}</Text>
              ) : null}
            </View>
            {!history.loading && !history.failed && sessions.length ? (
              <LineChart
                week={{ timezone: history.timezone, weekStart: history.weekStart }}
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
                        variant={metric === value ? "primary" : "tertiary"}
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
              {exerciseHistory.map(({ entry, history, type, count, lastSessionId, memory }) => {
                const sets =
                  history[0]?.sets.flatMap((set) =>
                    set.exercise_id === entry.exerciseId && isCounted(set) ? [set] : [],
                  ) ?? [];
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
                  type,
                );
                return (
                  <View key={entry.id} className="gap-1 py-2">
                    <ExerciseHeading
                      title={entry.exercise?.title ?? t("training__workout")}
                      imageMediaId={entry.exercise?.imageMediaId}
                      thumbnailKey={entry.exercise?.thumbnailKey ?? null}
                      onPress={() =>
                        router.push(
                          { pathname: "/exercises/[id]", params: { id: entry.exerciseId } },
                          ANCHORED,
                        )
                      }
                    />
                    {count > 0 && lastSessionId && (!memory.dismissed || memory.applied) ? (
                      <StalledNote
                        key={stallVersion}
                        exerciseId={entry.exerciseId}
                        latestSessionId={lastSessionId}
                        count={count}
                        applied={memory.applied}
                      />
                    ) : null}
                    {entry.restSeconds !== null ? (
                      <View className="min-h-8 flex-row items-center gap-2 px-1">
                        <Timer size={20} color={subtle} />
                        <Text className="font-normal text-caption text-muted tabular-nums">
                          {t("training__rest_link", { value: formatClock(entry.restSeconds) })}
                        </Text>
                      </View>
                    ) : null}
                    {entry.note ? (
                      <View className="min-h-8 flex-row items-start gap-2 px-1">
                        <Note size={20} color={subtle} />
                        <Text className="font-normal flex-1 text-caption text-muted">
                          {entry.note}
                        </Text>
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={entry.exercise?.title ?? t("training__workout")}
                      accessibilityHint={t("training__edit_sets_hint")}
                      onPress={() =>
                        router.push({
                          pathname: "/train/workout/[id]/[entry]",
                          params: { id, entry: entry.id },
                        })
                      }
                      className="active:opacity-70"
                    >
                      <SetTextTable
                        headers={columns.map((column) => columnHeader(column, unit, scale))}
                        rows={rows}
                      />
                    </Pressable>
                    {sets.length ? (
                      <Text className="font-normal px-1 text-caption text-muted">
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
      {ready ? (
        <RenameWorkoutSheet
          isOpen={renaming}
          onOpenChange={setRenaming}
          value={renameBaseline}
          placeholder={shownTitle}
          onSave={(next) => void actions.update(id, { title: next })}
        />
      ) : null}
    </>
  );
}
