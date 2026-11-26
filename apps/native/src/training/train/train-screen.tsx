import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { ProgramSummary, WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { Barbell, ListNumbers, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { lastDoneLabel } from "@/platform/last-done";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SearchBar } from "@/platform/ui/search-bar";
import { SectionHeader } from "@/platform/ui/section-header";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { useActiveSessions, useStartSession } from "@/session";
import { SyncBanner } from "@/sync";
import { RunEndOffer } from "@/training/home/active-program-card";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useProgramLibrary } from "@/training/programs/use-program-library";
import { displayTitle } from "@/platform/training/derived-title";
import { useWorkoutActions } from "@/training/workouts/use-workout-actions";

import { ProgramGridRow } from "./program-grid";
import { RunHero } from "./run-hero";
import { combineStatus, isFirstSync } from "./train-status";
import { indexWorkouts, listWorkouts, showWorkoutTools, type WorkoutSort } from "./train-rows";
import { TrainingListState } from "./training-list-state";
import { useStartWorkout } from "./use-start-workout";
import { useWorkouts } from "./use-workouts";
import { useWorkoutRecency } from "./use-workout-recency";
import { WorkoutRow } from "./workout-row";

type TrainRow =
  | { kind: "program"; key: string; programs: ProgramSummary[] }
  | { kind: "workout-header"; key: string }
  | { kind: "workout"; key: string; workout: WorkoutSummary }
  | { kind: "workout-empty"; key: string };

const NO_ROWS: TrainRow[] = [];
const rowKey = (row: TrainRow) => row.key;
const rowType = (row: TrainRow) => row.kind;

/**
 * Train, top to bottom: the active program (cover, week chip, day strip, Start next), the
 * Programs as a grid of cover cards, then the workouts of no program as a list that gains search
 * and sort once there are more than eight. Create sits in the header; Resume lives in the bar
 * above the tabs. A Program's own Workouts are not listed here: they live in the Program.
 */
export function TrainScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const { sessions } = useActiveSessions();
  const resume = sessions[0];
  const workoutList = useWorkouts(false);
  const active = useActiveProgram();
  const programList = useProgramLibrary(active);
  const { workouts } = workoutList;
  const {
    programs,
    open: openProgram,
    retry: retryPrograms,
    activeId,
    activate,
    stop,
    duplicate: duplicateProgram,
    remove: removeProgram,
  } = programList;
  const { retry: retryWorkouts } = workoutList;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WorkoutSort>("recent");
  const recency = useWorkoutRecency(true).value;
  const timezone = useDeviceTimeZone();
  const lastDone = useMemo(
    () => new Map(recency?.map(({ id, lastDone }) => [id, lastDone])),
    [recency],
  );
  const tools = showWorkoutTools(workouts.length);
  const nameOf = useCallback(
    (workout: WorkoutSummary) =>
      displayTitle(
        workout.title,
        workout.exercises.flatMap((entry) =>
          entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
        ),
        (key) => t(key),
      ),
    [t],
  );
  const indexed = useMemo(() => indexWorkouts(workouts, nameOf), [workouts, nameOf]);
  const programRows = useMemo(() => {
    const rows: TrainRow[] = [];
    for (let i = 0; i < programs.length; i += 2) {
      const first = programs[i];
      if (first) rows.push({ kind: "program", key: first.id, programs: programs.slice(i, i + 2) });
    }
    return rows;
  }, [programs]);
  const rows = useMemo(() => {
    const found = listWorkouts({
      workouts: indexed,
      query: tools ? query : "",
      sort: tools ? sort : "recent",
      lastDone,
    });
    const rows: TrainRow[] = [...programRows, { kind: "workout-header", key: "workout-header" }];
    for (const workout of found) rows.push({ kind: "workout", key: workout.id, workout });
    if (found.length === 0) rows.push({ kind: "workout-empty", key: "workout-empty" });
    return rows;
  }, [indexed, tools, query, sort, lastDone, programRows]);

  // One ready state: the active program, programs and workouts all come from the local database,
  // and nothing is drawn until every one of them has answered, so the screen appears at once.
  const combined = combineStatus(workoutList.status, programList.status);
  const status = combined !== "error" && !active.ready ? "loading" : combined;
  const retry = useCallback(() => {
    retryWorkouts();
    retryPrograms();
  }, [retryWorkouts, retryPrograms]);
  const { fromPicker } = useStartWorkout();
  const { duplicate: duplicateWorkout, remove: removeWorkout } = useWorkoutActions();
  const [newOpen, setNewOpen] = useState(false);
  const { start, startSlot, sheet: startSheet } = useStartSession();
  const newWorkout = useCallback(() => void fromPicker(), [fromPicker]);
  const newProgram = useCallback(() => router.push("/train/new-program"), [router]);
  const newActions = useMemo(
    () => [
      {
        key: "workout",
        label: t("training__new_workout"),
        description: t("training__new_workout_hint"),
        icon: Plus,
        onPress: newWorkout,
      },
      {
        key: "program",
        label: t("training__new_program"),
        description: t("training__new_program_hint"),
        icon: ListNumbers,
        onPress: newProgram,
      },
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
  const duplicate = useCallback(
    async (workout: { id: string; title: string | null }) => {
      const copy = await duplicateWorkout(workout.id, workout.title);
      if (copy) open(copy);
    },
    [duplicateWorkout, open],
  );
  const remove = useCallback(
    (id: string, title: string) => void removeWorkout(id, title),
    [removeWorkout],
  );
  const startWorkout = useCallback((id: string) => void start(id), [start]);
  const share = useCallback(
    (id: string) =>
      router.push({ pathname: "/share/[kind]/[id]", params: { kind: "workout", id } }),
    [router],
  );
  const startDay = useCallback(
    (...args: Parameters<typeof startSlot>) => void startSlot(...args),
    [startSlot],
  );
  const renderRow = useCallback(
    ({ item }: { item: TrainRow }) => {
      if (item.kind === "program")
        return (
          <ProgramGridRow
            programs={item.programs}
            activeId={activeId}
            onActivate={activate}
            onStop={stop}
            onOpen={openProgram}
            onDuplicate={duplicateProgram}
            onDelete={removeProgram}
          />
        );
      if (item.kind === "workout-header")
        return (
          <View className="gap-2 px-4 pt-4 pb-1">
            <SectionHeader title={t("training__workouts_title")} />
            {tools ? (
              <View className="gap-3">
                <SearchBar
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("training__search_workouts")}
                  clearLabel={t("exercise__search_clear")}
                />
                <SegmentedControl
                  accessibilityLabel={t("training__sort_workouts")}
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "recent", label: t("training__sort_recent") },
                    { value: "name", label: t("training__sort_name") },
                  ]}
                />
              </View>
            ) : null}
          </View>
        );
      if (item.kind === "workout-empty")
        return (
          <View className="px-4">
            {isFirstSync(workoutList.status) ? (
              <TrainingListState status={workoutList.status} onRetry={retryWorkouts} />
            ) : tools && query.trim() !== "" ? (
              <EmptyState
                icon={Barbell}
                title={t("training__no_workouts_match", { query: query.trim() })}
              />
            ) : (
              <Text className="font-normal text-body text-muted">
                {t("training__no_standalone_workouts")}
              </Text>
            )}
          </View>
        );
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
          onDelete={remove}
        />
      );
    },
    [
      activeId,
      activate,
      stop,
      openProgram,
      duplicateProgram,
      removeProgram,
      tools,
      query,
      sort,
      retryWorkouts,
      workoutList.status,
      open,
      startWorkout,
      edit,
      share,
      duplicate,
      remove,
      lastDone,
      t,
      i18n.language,
      timezone,
    ],
  );

  const ready = status === "list" || status === "empty";
  return (
    <SwipeGroup>
      <ConfirmationDialog {...active.confirmationProps} />
      <Page
        title={t("training__title")}
        actions={
          <View className="flex-row">
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("training__create")}
              onPress={() => setNewOpen(true)}
            >
              <Plus size={24} weight="regular" color={subtle} />
            </Button>
          </View>
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
            getItemType={rowType}
            estimatedItemSize={88}
            extraData={renderRow}
            renderItem={renderRow}
            ListHeaderComponent={
              <View className="gap-6 px-4 pb-1">
                <View className="gap-4">
                  {header}
                  <SyncBanner />
                  <TrainingListState status={status} onRetry={retry} />
                  {ready ? (
                    <RunHero
                      state={active}
                      onOpen={openProgram}
                      onPlan={(programId) =>
                        router.push({
                          pathname: "/train/program/[id]/weeks",
                          params: { id: programId },
                        })
                      }
                      onStart={startDay}
                      startSecondary={resume !== undefined}
                    />
                  ) : null}
                </View>
                {ready && programs.length > 0 ? (
                  <View className="gap-1">
                    <SectionHeader
                      title={t("training__programs")}
                      actionLabel={t("exercise__see_all")}
                      actionAccessibilityLabel={t("training__see_all_programs")}
                      onAction={() => router.push("/train/programs")}
                    />
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View className="px-4">
                {status === "empty" ? (
                  <EmptyState
                    icon={Barbell}
                    label={t("empty__workouts", { count: 0 })}
                    title={t("training__no_workouts")}
                    description={t("training__no_workouts_hint")}
                    action={{ label: t("training__new_workout"), onPress: newWorkout }}
                  />
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
