import { ActiveProgramCard } from "./active-program-card";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Barbell, ListNumbers, PlayCircle, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SectionHeader } from "@/platform/ui/section-header";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { useStartSession } from "@/session";
import { SyncBanner } from "@/sync";

import { lastDoneLabel } from "../last-done";
import { combineStatus } from "../train-status";
import { useLastDone } from "../use-last-done";
import { useActiveProgram } from "../use-active-program";
import { useProgramLibrary } from "../use-program-library";
import { useStartWorkout } from "../use-start-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { useWorkouts } from "../use-workouts";
import { ProgramList } from "./program-row";
import { TrainingListState } from "./training-list-state";
import { WorkoutRow } from "./workout-row";

const PROGRAM_PREVIEW_COUNT = 2;
const NO_WORKOUTS: WorkoutSummary[] = [];
const workoutKey = (workout: WorkoutSummary) => workout.id;

/** One library: a compact program preview, then matching workout rows, with one creation action. */
export function TrainScreen({ onStartEmpty }: { onStartEmpty: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const workoutList = useWorkouts();
  const active = useActiveProgram();
  const programList = useProgramLibrary(active);
  const { workouts } = workoutList;
  const { programs } = programList;
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
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Plus, onPress: newWorkout },
      { key: "program", label: t("training__new_program"), icon: ListNumbers, onPress: newProgram },
      {
        key: "session",
        label: t("session__empty_session"),
        icon: PlayCircle,
        onPress: onStartEmpty,
      },
    ],
    [t, newWorkout, newProgram, onStartEmpty],
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
  const renderWorkout = useCallback(
    ({ item }: { item: WorkoutSummary }) => {
      const at = lastDone.get(item.id);
      return (
        <WorkoutRow
          workout={item}
          lastDone={
            at
              ? t("workout__last_done", {
                  date: lastDoneLabel(at, new Date(), i18n.language, timezone),
                })
              : null
          }
          onOpen={open}
          onStart={startWorkout}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      );
    },
    [open, startWorkout, duplicate, remove, lastDone, t, i18n.language, timezone],
  );

  return (
    <SwipeGroup>
      <Page
        title={t("training__title")}
        actions={
          <Button variant="primary" className="rounded-full" onPress={() => setNewOpen(true)}>
            <Plus size={16} color={onAction} weight="bold" />
            <Button.Label>{t("training__create")}</Button.Label>
          </Button>
        }
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <AnimatedLegendList
            recycleItems={false}
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            data={status === "list" ? workouts : NO_WORKOUTS}
            keyExtractor={workoutKey}
            estimatedItemSize={88}
            extraData={renderWorkout}
            renderItem={renderWorkout}
            ListHeaderComponent={
              <View className="gap-8 px-4 pb-1">
                {header}
                <SyncBanner />
                {status === "loading" ? null : <ActiveProgramCard state={active} offerEnd />}
                <TrainingListState status={status} onRetry={retry} />
                {status === "list" && programs.length > 0 ? (
                  <View className="gap-1">
                    <SectionHeader
                      title={t("training__programs")}
                      actionLabel={t("training__view_all")}
                      actionAccessibilityLabel={t("training__view_all_programs")}
                      onAction={() => router.push("/train/programs")}
                    />
                    <View className="-mx-4">
                      <ProgramList
                        programs={programs.slice(0, PROGRAM_PREVIEW_COUNT)}
                        activeId={programList.activeId}
                        onActivate={programList.activate}
                        onStop={programList.stop}
                        onOpen={programList.open}
                        onDuplicate={programList.duplicate}
                        onDelete={programList.remove}
                      />
                    </View>
                  </View>
                ) : null}
                {status === "list" ? <SectionHeader title={t("training__workouts")} /> : null}
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
      <ActionSheet
        title={t("training__create")}
        actions={newActions}
        isOpen={newOpen}
        onOpenChange={setNewOpen}
      />
    </SwipeGroup>
  );
}
