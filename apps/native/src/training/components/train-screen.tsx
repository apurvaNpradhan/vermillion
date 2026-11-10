import { ActiveProgramCard } from "./active-program-card";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Barbell, CaretRight, ListNumbers, PlayCircle, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { combineStatus } from "../train-status";
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
  const { t } = useTranslation();
  const router = useRouter();
  const workoutList = useWorkouts();
  const programList = useProgramLibrary();
  const { workouts } = workoutList;
  const { programs } = programList;
  const status = combineStatus(workoutList.status, programList.status);
  const retry = useCallback(() => {
    workoutList.retry();
    programList.retry();
  }, [workoutList, programList]);
  const { fromPicker } = useStartWorkout();
  const actions = useWorkoutActions();
  const [newOpen, setNewOpen] = useState(false);
  const onAction = useThemeColor("accent-foreground");
  const subtle = useSubtleColor();
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
  const renderWorkout = useCallback(
    ({ item, index }: { item: WorkoutSummary; index: number }) => (
      <View
        className={`mx-4 overflow-hidden border-x border-b border-border ${index === 0 ? "rounded-t-2xl border-t" : ""} ${index === workouts.length - 1 ? "rounded-b-2xl" : ""}`}
      >
        <WorkoutRow workout={item} onOpen={open} onDuplicate={duplicate} onDelete={remove} />
      </View>
    ),
    [open, duplicate, remove, workouts.length],
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
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            data={status === "list" ? workouts : NO_WORKOUTS}
            keyExtractor={workoutKey}
            estimatedItemSize={88}
            extraData={renderWorkout}
            renderItem={renderWorkout}
            ListHeaderComponent={
              <View className="gap-6 px-4 pb-3">
                {header}
                <SyncBanner />
                <ActiveProgramCard offerEnd />
                <TrainingListState status={status} onRetry={retry} />
                {status === "list" && programs.length > 0 ? (
                  <View className="gap-2">
                    <View className="min-h-11 flex-row items-center justify-between gap-3">
                      <Text
                        accessibilityRole="header"
                        className="font-semibold text-title-md text-foreground"
                      >
                        {t("training__programs")}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("training__view_all_programs")}
                        onPress={() => router.push("/train/programs")}
                        className="min-h-11 flex-row items-center gap-1 px-1 active:opacity-60"
                      >
                        <Text className="text-caption text-muted">{t("training__view_all")}</Text>
                        <CaretRight size={13} color={subtle} />
                      </Pressable>
                    </View>
                    <ProgramList
                      programs={programs.slice(0, PROGRAM_PREVIEW_COUNT)}
                      onOpen={programList.open}
                      onDuplicate={programList.duplicate}
                      onDelete={programList.remove}
                    />
                  </View>
                ) : null}
                {status === "list" ? (
                  <Text
                    accessibilityRole="header"
                    className="font-semibold text-title-md text-foreground"
                  >
                    {t("training__workouts")}
                  </Text>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View className="px-4">
                {status === "empty" ? (
                  <EmptyState icon={Barbell} title={t("training__empty_plans")} />
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
      <ActionSheet
        title={t("training__create")}
        actions={newActions}
        isOpen={newOpen}
        onOpenChange={setNewOpen}
      />
    </SwipeGroup>
  );
}
