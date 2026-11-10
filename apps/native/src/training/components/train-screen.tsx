import { useRouter } from "expo-router";
import { Barbell, ListNumbers, Plus, WarningCircle } from "phosphor-react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { EmptyState } from "@/platform/ui/empty-state";
import { ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { useProgramActions } from "../use-program-actions";
import { usePrograms } from "../use-programs";
import { useStartWorkout } from "../use-start-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { useWorkouts } from "../use-workouts";
import { combineStatus } from "../train-status";
import { ProgramRow } from "./program-row";
import { WorkoutRow } from "./workout-row";

/**
 * The Train tab: Programs, then standalone Workouts (a Program's own Workouts live in it), each
 * newest first. The tab action opens a small sheet to start either. Each state of the lists
 * (loading, first sync, empty, error) looks different.
 */
export function TrainScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const workoutList = useWorkouts();
  const programList = usePrograms();
  const { workouts } = workoutList;
  const { programs } = programList;
  const status = combineStatus(workoutList.status, programList.status);
  const retry = useCallback(() => {
    workoutList.retry();
    programList.retry();
  }, [workoutList, programList]);
  const { fromPicker } = useStartWorkout();
  const actions = useWorkoutActions();
  const programActions = useProgramActions();
  const [newOpen, setNewOpen] = useState(false);

  const newWorkout = useCallback(() => void fromPicker(), [fromPicker]);
  const openNew = useCallback(() => setNewOpen(true), []);
  useTabAction(
    useMemo(() => ({ icon: Plus, label: t("training__new"), onPress: openNew }), [t, openNew]),
  );
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Barbell, onPress: newWorkout },
      {
        key: "program",
        label: t("training__new_program"),
        icon: ListNumbers,
        onPress: () => router.push("/train/new-program"),
      },
    ],
    [t, newWorkout, router],
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
  const openProgram = useCallback(
    (id: string) => router.push({ pathname: "/train/program/[id]", params: { id } }),
    [router],
  );
  const duplicateProgram = useCallback(
    async (program: { id: string; title: string }) => {
      const copy = await programActions.duplicate(program.id, program.title);
      if (copy) openProgram(copy);
    },
    [programActions, openProgram],
  );
  const removeProgram = useCallback(
    (id: string, title: string) => void programActions.remove(id, title),
    [programActions],
  );

  return (
    <ScrollPage title={t("training__title")}>
      <SyncBanner />
      {status === "loading" ? <ListSkeleton label={t("common__loading")} /> : null}
      {status === "first-sync" ? (
        <View className="gap-3">
          <ListSkeleton label={t("common__loading")} />
          <Text accessibilityLiveRegion="polite" className="text-center text-caption text-muted">
            {t("training__first_sync")}
          </Text>
        </View>
      ) : null}
      {status === "error" ? (
        <EmptyState
          icon={WarningCircle}
          title={t("training__load_failed")}
          action={{ label: t("training__retry"), onPress: retry }}
        />
      ) : null}
      {status === "empty" ? (
        <EmptyState
          icon={Barbell}
          title={t("training__empty_title")}
          action={{ label: t("training__new"), onPress: openNew }}
        />
      ) : null}
      {status === "list" ? (
        <View className="-mx-4 gap-6">
          {programs.length > 0 ? (
            <Section title={t("training__programs")}>
              {programs.map((program) => (
                <ProgramRow
                  key={program.id}
                  program={program}
                  onOpen={openProgram}
                  onDuplicate={duplicateProgram}
                  onDelete={removeProgram}
                />
              ))}
            </Section>
          ) : null}
          {workouts.length > 0 ? (
            <Section title={t("training__workouts")}>
              {workouts.map((workout) => (
                <WorkoutRow
                  key={workout.id}
                  workout={workout}
                  onOpen={open}
                  onDuplicate={duplicate}
                  onDelete={remove}
                />
              ))}
            </Section>
          ) : null}
        </View>
      ) : null}
      <ActionSheet
        title={t("training__new")}
        actions={newActions}
        isOpen={newOpen}
        onOpenChange={setNewOpen}
      />
    </ScrollPage>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="px-5 font-semibold text-overline uppercase text-muted"
      >
        {title}
      </Text>
      <SwipeGroup>
        <View className="border-t border-border">{children}</View>
      </SwipeGroup>
    </View>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} className="min-h-[72px] flex-row items-center gap-3 py-3">
          <Skeleton style={{ width: 48, height: 48 }} />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}
