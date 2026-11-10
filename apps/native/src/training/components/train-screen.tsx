import { useRouter } from "expo-router";
import {
  CaretRight,
  Lightning,
  ListNumbers,
  Plus,
  WarningCircle,
  type IconProps,
} from "phosphor-react-native";
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Card } from "@/platform/ui/card";
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
  const newProgram = useCallback(() => router.push("/train/new-program"), [router]);
  useTabAction(
    useMemo(() => ({ icon: Plus, label: t("training__new"), onPress: openNew }), [t, openNew]),
  );
  const newActions = useMemo(
    () => [
      { key: "workout", label: t("training__new_workout"), icon: Plus, onPress: newWorkout },
      {
        key: "program",
        label: t("training__new_program"),
        icon: ListNumbers,
        onPress: newProgram,
      },
    ],
    [t, newWorkout, newProgram],
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
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
            {t("training__empty_title")}
          </Text>
          <StartCard
            icon={Lightning}
            title={t("training__new_workout")}
            body={t("training__start_workout_body")}
            onPress={newWorkout}
          />
          <StartCard
            icon={ListNumbers}
            title={t("training__new_program")}
            body={t("training__start_program_body")}
            onPress={newProgram}
          />
        </View>
      ) : null}
      {status === "list" ? (
        <SwipeGroup>
          <View className="gap-6">
            <Section
              title={t("training__programs")}
              newLabel={t("training__new_program")}
              onNew={newProgram}
              empty={programs.length === 0 ? t("training__programs_none") : null}
            >
              <View className="gap-3">
                {programs.map((program) => (
                  <ProgramRow
                    key={program.id}
                    program={program}
                    onOpen={openProgram}
                    onDuplicate={duplicateProgram}
                    onDelete={removeProgram}
                  />
                ))}
              </View>
            </Section>
            <Section
              title={t("training__workouts")}
              newLabel={t("training__new_workout")}
              onNew={newWorkout}
              empty={workouts.length === 0 ? t("training__workouts_none") : null}
              bleed
            >
              {workouts.length > 0 ? (
                <View className="border-t border-border">
                  {workouts.map((workout) => (
                    <WorkoutRow
                      key={workout.id}
                      workout={workout}
                      onOpen={open}
                      onDuplicate={duplicate}
                      onDelete={remove}
                    />
                  ))}
                </View>
              ) : null}
            </Section>
          </View>
        </SwipeGroup>
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

/**
 * A titled part of the list with a small "New" action on the right. `bleed` lets the rows run
 * edge to edge (the Workouts); the Programs are cards inside the page margin.
 */
function Section({
  title,
  newLabel,
  onNew,
  empty,
  bleed = false,
  children,
}: {
  title: string;
  newLabel: string;
  onNew: () => void;
  /** A quiet line shown instead of the items while the section has none. */
  empty: string | null;
  bleed?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className={`gap-2 ${bleed ? "-mx-4" : ""}`}>
      <View className={`flex-row items-center justify-between ${bleed ? "px-5" : "px-1"}`}>
        <Text
          accessibilityRole="header"
          className="font-semibold text-overline uppercase text-muted"
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={newLabel}
          onPress={onNew}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
          className="min-h-8 justify-center active:opacity-60"
        >
          <Text className="text-label font-medium text-foreground">{t("training__new")}</Text>
        </Pressable>
      </View>
      {empty === null ? (
        children
      ) : (
        <Text className={`text-caption text-muted ${bleed ? "px-5" : "px-1"}`}>{empty}</Text>
      )}
    </View>
  );
}

/** A large tappable card of the empty state: icon, title, one line, chevron. */
function StartCard({
  icon: Icon,
  title,
  body,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const subtle = useSubtleColor();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      className="active:opacity-80"
    >
      <Card className="flex-row items-center gap-4 p-4">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="size-14 items-center justify-center rounded-xl bg-default"
        >
          <Icon size={28} color={subtle} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-title-md text-foreground">{title}</Text>
          <Text className="text-body text-muted">{body}</Text>
        </View>
        <CaretRight size={18} color={subtle} />
      </Card>
    </Pressable>
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
