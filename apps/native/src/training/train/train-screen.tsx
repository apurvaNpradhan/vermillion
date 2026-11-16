import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { useSubtleColor } from "@/platform/theme";
import { Barbell, ListNumbers, PlayCircle, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { useStartSession } from "@/session";
import { SyncBanner } from "@/sync";

import { lastDoneLabel } from "@/training/home/last-done";
import { combineStatus } from "./train-status";
import { useLastDone } from "@/training/home/use-last-done";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useProgramLibrary } from "@/training/programs/use-program-library";
import { useStartWorkout } from "./use-start-workout";
import { useWorkoutActions } from "@/training/workouts/use-workout-actions";
import { useWorkouts } from "./use-workouts";
import { trainRows, type TrainRow } from "./train-rows";
import { RunEndOffer } from "@/training/home/active-program-card";
import { TrainingListState } from "./training-list-state";
import { WorkoutRow } from "./workout-row";

type Row = TrainRow<WorkoutSummary>;
const NO_ROWS: Row[] = [];
const rowKey = (row: Row) => (row.kind === "heading" ? `heading-${row.id}` : row.workout.id);

/**
 * One list of workouts, each with when it was last done: the active program's first, then the
 * rest (or all of them when no program is active). Program management sits behind the header's
 * Programs button; creating a workout or an empty session behind Create.
 */
export function TrainScreen({ onStartEmpty }: { onStartEmpty: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const workoutList = useWorkouts(true);
  const active = useActiveProgram();
  const programList = useProgramLibrary(active);
  const { workouts } = workoutList;
  const { programs } = programList;
  const rows = useMemo(
    () =>
      trainRows({
        workouts,
        activeWorkoutIds: active.program
          ? active.program.slots.map((slot) => slot.workoutId)
          : null,
        ownedIds: new Set(
          programs.flatMap((program) => program.slots.map((slot) => slot.workoutId ?? "")),
        ),
      }),
    [workouts, active.program, programs],
  );
  // One ready state: the active program, programs and workouts all come from the local database,
  // and nothing is drawn until every one of them has answered, so the screen appears at once.
  const combined = combineStatus(workoutList.status, programList.status);
  const status = combined !== "error" && !active.ready ? "loading" : combined;
  const retry = useCallback(() => {
    workoutList.retry();
    programList.retry();
  }, [workoutList, programList]);
  const { fromPicker } = useStartWorkout();
  const actions = useWorkoutActions();
  const [newOpen, setNewOpen] = useState(false);
  const onAction = useThemeColor("accent-foreground");
  const { lastDone, timezone } = useLastDone();
  const { start, sheet: startSheet } = useStartSession();
  const newWorkout = useCallback(() => void fromPicker(), [fromPicker]);
  const newProgram = useCallback(() => router.push("/train/new-program"), [router]);
  const subtle = useSubtleColor();
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Plus, onPress: newWorkout },
      {
        key: "session",
        label: t("session__empty_session"),
        icon: PlayCircle,
        onPress: onStartEmpty,
      },
    ],
    [t, newWorkout, onStartEmpty],
  );
  const open = useCallback(
    (id: string) => router.push({ pathname: "/train/workout/[id]", params: { id } }),
    [router],
  );
  const duplicate = useCallback(
    async (workout: { id: string; title: string | null }) => {
      const copy = await actions.duplicate(workout.id, workout.title);
      if (copy) open(copy);
    },
    [actions, open],
  );
  const remove = useCallback(
    (id: string, title: string) => void actions.remove(id, title),
    [actions],
  );
  const startWorkout = useCallback((id: string) => void start(id), [start]);
  const share = useCallback(
    (id: string) =>
      router.push({ pathname: "/share/[kind]/[id]", params: { kind: "workout", id } }),
    [router],
  );
  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "heading") {
        return (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="px-4 pb-1 pt-6 text-overline font-semibold uppercase text-muted"
          >
            {item.id === "program" ? (active.program?.title ?? "") : t("training__other_workouts")}
          </Text>
        );
      }
      const at = lastDone.get(item.workout.id);
      return (
        <WorkoutRow
          workout={item.workout}
          lastDone={
            at
              ? t("workout__last_done", {
                  date: lastDoneLabel(at, new Date(), i18n.language, timezone),
                })
              : null
          }
          onOpen={open}
          onStart={startWorkout}
          onShare={share}
          onDuplicate={item.owned ? undefined : duplicate}
          onDelete={item.owned ? undefined : remove}
        />
      );
    },
    [
      open,
      startWorkout,
      share,
      duplicate,
      remove,
      lastDone,
      active.program?.title,
      t,
      i18n.language,
      timezone,
    ],
  );

  return (
    <SwipeGroup>
      <Page
        title={t("training__title")}
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("training__programs")}
              hitSlop={4}
              onPress={() => router.push("/train/programs")}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-default"
            >
              <ListNumbers size={20} color={subtle} />
            </Pressable>
            <Button variant="primary" className="rounded-full" onPress={() => setNewOpen(true)}>
              <Plus size={16} color={onAction} weight="bold" />
              <Button.Label>{t("training__create")}</Button.Label>
            </Button>
          </>
        }
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <AnimatedLegendList
            recycleItems={false}
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            data={status === "list" ? rows : NO_ROWS}
            keyExtractor={rowKey}
            estimatedItemSize={88}
            extraData={renderRow}
            renderItem={renderRow}
            ListHeaderComponent={
              <View className="gap-6 px-4 pb-1">
                {header}
                <SyncBanner />
                <TrainingListState status={status} onRetry={retry} />
              </View>
            }
            ListEmptyComponent={
              <View className="px-4">
                {status === "empty" ? (
                  <View className="items-center gap-2">
                    <EmptyState icon={Barbell} title={t("training__empty_plans")} />
                    <View className="flex-row flex-wrap justify-center gap-3">
                      <Button variant="secondary" onPress={newWorkout}>
                        <Button.Label>{t("training__new_workout")}</Button.Label>
                      </Button>
                      <Button variant="secondary" onPress={newProgram}>
                        <Button.Label>{t("training__new_program")}</Button.Label>
                      </Button>
                    </View>
                  </View>
                ) : status === "list" ? (
                  workoutList.status === "first-sync" ? (
                    <TrainingListState status={workoutList.status} onRetry={workoutList.retry} />
                  ) : (
                    <EmptyState icon={Barbell} title={t("training__no_workouts")} />
                  )
                ) : null}
              </View>
            }
          />
        )}
      </Page>
      {startSheet}
      <RunEndOffer state={active} />
      <ActionSheet
        title={t("training__create")}
        actions={newActions}
        isOpen={newOpen}
        onOpenChange={setNewOpen}
      />
    </SwipeGroup>
  );
}
