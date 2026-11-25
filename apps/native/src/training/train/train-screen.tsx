import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { ProgramSummary, WorkoutSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { Barbell, Hash, ListNumbers, Lightning, Plus } from "phosphor-react-native";
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
import { displayTitle } from "@/training/workouts/derived-title";
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
 * Train, top to bottom: the Resume card while a Session is in progress, the active Run (cover,
 * week, cycle strip, Start next), the Programs as a grid of cover cards, then the standalone
 * Workouts as a list that gains search and sort once there are more than eight. Create and Start
 * empty sit in the header. A Program's own Workouts are not listed here: they live in the Program.
 */
export function TrainScreen({ onStartEmpty }: { onStartEmpty: () => void }) {
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
  const enterCode = useCallback(() => router.push("/import"), [router]);
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Plus, onPress: newWorkout },
      { key: "program", label: t("training__new_program"), icon: ListNumbers, onPress: newProgram },
      { key: "code", label: t("share__enter_code_title"), icon: Hash, onPress: enterCode },
    ],
    [t, newWorkout, newProgram, enterCode],
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
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("home__start_empty")}
              onPress={onStartEmpty}
            >
              <Lightning size={24} weight="regular" color={subtle} />
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
                  {ready ? (
                    <RunHero
                      state={active}
                      onOpen={openProgram}
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
