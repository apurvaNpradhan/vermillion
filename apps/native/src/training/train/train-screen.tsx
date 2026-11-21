import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { useSubtleColor } from "@/platform/theme";
import { Barbell, CaretDown, CaretRight, CaretUp, ListNumbers, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { useActiveSessions, useStartSession } from "@/session";
import { SyncBanner } from "@/sync";

import { lastDoneLabel } from "@/training/home/last-done";
import { combineStatus, isFirstSync } from "./train-status";
import { useLastDone } from "@/training/home/use-last-done";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useProgramLibrary } from "@/training/programs/use-program-library";
import { useStartWorkout } from "./use-start-workout";
import { useWorkoutActions } from "@/training/workouts/use-workout-actions";
import { useWorkouts } from "./use-workouts";
import { trainList, trainRows, type TrainListItem } from "./train-rows";
import { RunEndOffer } from "@/training/home/active-program-card";
import { TrainingListState } from "./training-list-state";
import { ProgramCard } from "./program-card";
import { WorkoutRow } from "./workout-row";

type Row = TrainListItem<WorkoutSummary>;
const NO_ROWS: Row[] = [];
const rowKey = (row: Row) =>
  row.kind === "workout" ? row.key : row.kind === "program" ? `program-${row.id}` : row.kind;

/**
 * Train: the active program as a card with its rotation and Start, its workouts as rows (swipe for
 * Start and Edit) with when each was last done, and everything else folded behind "Other
 * workouts". Programs sit behind the header button; Create and Start empty are two quiet buttons
 * under the card, and the empty state offers Start empty too.
 */
export function TrainScreen({ onStartEmpty }: { onStartEmpty: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { sessions } = useActiveSessions();
  const resume = sessions[0];
  const workoutList = useWorkouts(true);
  const active = useActiveProgram();
  const programList = useProgramLibrary(active);
  const [showOther, setShowOther] = useState(false);
  const { workouts } = workoutList;
  const { programs } = programList;
  const rows = useMemo(
    () =>
      trainList(
        trainRows({
          workouts,
          programs: programs.map((program) => ({
            id: program.id,
            title: program.title,
            workoutIds: program.slots.map((slot) => slot.workoutId),
          })),
          activeProgramId: active.program?.id ?? null,
        }),
        showOther,
      ),
    [workouts, active.program?.id, programs, showOther],
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
  const { lastDone, timezone } = useLastDone();
  const { start, sheet: startSheet } = useStartSession();
  const newWorkout = useCallback(() => void fromPicker(), [fromPicker]);
  const newProgram = useCallback(() => router.push("/train/new-program"), [router]);
  const subtle = useSubtleColor();
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Plus, onPress: newWorkout },
      { key: "program", label: t("training__new_program"), icon: ListNumbers, onPress: newProgram },
    ],
    [t, newWorkout, newProgram],
  );
  const edit = useCallback(
    (id: string) => router.push({ pathname: "/train/workout/[id]/edit", params: { id } }),
    [router],
  );
  const open = useCallback(
    (id: string) => router.push({ pathname: "/train/workout/[id]", params: { id } }),
    [router],
  );
  const openProgram = programList.open;
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
      if (item.kind === "more") {
        const Caret = item.expanded ? CaretUp : CaretDown;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: item.expanded }}
            accessibilityLabel={t("training__other_workouts_toggle", { count: item.count })}
            accessibilityHint={t(item.expanded ? "training__hide_other" : "training__show_other")}
            onPress={() => setShowOther((current) => !current)}
            className="min-h-12 flex-row items-center gap-2 px-4 pt-4 active:opacity-70"
          >
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="shrink font-semibold text-title-md text-foreground"
            >
              {t("training__other_workouts")}
            </Text>
            <Text className="font-normal text-body tabular-nums text-muted">{item.count}</Text>
            <View className="flex-1" />
            <Caret size={20} weight="regular" color={subtle} />
          </Pressable>
        );
      }
      if (item.kind === "program") {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => openProgram(item.id)}
            className="flex-row items-center gap-2 px-4 pb-1 pt-7 active:opacity-70"
          >
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="shrink font-semibold text-title-md text-foreground"
            >
              {item.title}
            </Text>
            <View className="flex-1" />
            <CaretRight size={20} weight="regular" color={subtle} />
          </Pressable>
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
          onEdit={edit}
          onShare={share}
          onDuplicate={duplicate}
          onDelete={item.owned ? undefined : remove}
        />
      );
    },
    [
      open,
      startWorkout,
      edit,
      share,
      duplicate,
      remove,
      lastDone,
      openProgram,
      subtle,
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
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("training__programs")}
            onPress={() => router.push("/train/programs")}
          >
            <ListNumbers size={24} weight="regular" color={subtle} />
          </Button>
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
              <View className="gap-4 px-4 pb-1">
                {header}
                {resume ? (
                  <View className="flex-row flex-wrap items-center gap-3 rounded-xl bg-surface p-3.5">
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-title-md font-semibold text-foreground">
                        {resume.title}
                      </Text>
                      <Text className="font-normal text-caption text-muted">
                        {t("home__in_progress")}
                      </Text>
                    </View>
                    <Button
                      accessibilityLabel={t("session__resume_label", { title: resume.title })}
                      onPress={() =>
                        router.push({ pathname: "/session/[id]", params: { id: resume.id } })
                      }
                    >
                      <Button.Label>{t("session__resume")}</Button.Label>
                    </Button>
                  </View>
                ) : null}
                <SyncBanner />
                <TrainingListState status={status} onRetry={retry} />
                {status === "list" ? (
                  <>
                    <ProgramCard
                      state={active}
                      onOpen={openProgram}
                      onStart={startWorkout}
                      startSecondary={resume !== undefined}
                    />
                    <View className="flex-row gap-3">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onPress={() => setNewOpen(true)}
                      >
                        <Plus size={20} weight="regular" color={subtle} />
                        <Button.Label>{t("training__create")}</Button.Label>
                      </Button>
                      <Button variant="secondary" className="flex-1" onPress={onStartEmpty}>
                        <Button.Label>{t("home__start_empty")}</Button.Label>
                      </Button>
                    </View>
                  </>
                ) : null}
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
                      <Button variant="secondary" onPress={onStartEmpty}>
                        <Button.Label>{t("home__start_empty")}</Button.Label>
                      </Button>
                    </View>
                  </View>
                ) : status === "list" ? (
                  isFirstSync(workoutList.status) ? (
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
