import { FixedSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { Plus } from "phosphor-react-native";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { displayTitle } from "./derived-title";
import { useStartWorkout } from "@/training/train/use-start-workout";
import { useWorkoutActions } from "./use-workout-actions";
import type { WorkoutSummary } from "@workspace/sync";
import { usePrograms } from "@/training/programs/use-programs";
import { useWorkouts } from "@/training/train/use-workouts";
import { combineStatus, isFirstSync } from "@/training/train/train-status";

export function AddToWorkoutSheet({
  exerciseId,
  isOpen,
  onOpenChange,
}: {
  exerciseId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useAppToast();
  const { bottom } = useSafeAreaInsets();
  const workoutList = useWorkouts(true);
  const programList = usePrograms();
  const status = combineStatus(workoutList.status, programList.status);
  const { workouts } = workoutList;
  const groups = new Map<string | null, WorkoutSummary[]>();
  for (const workout of workouts) {
    const group = groups.get(workout.programId) ?? [];
    group.push(workout);
    groups.set(workout.programId, group);
  }
  const standalone = groups.get(null) ?? [];

  const actions = useWorkoutActions();
  const { withExercises } = useStartWorkout();

  const add = async (id: string, title: string) => {
    onOpenChange(false);
    if (await actions.append(id, [exerciseId])) {
      toast.show({ label: t("training__added_toast", { title }) });
    }
  };

  const integer = new Intl.NumberFormat(i18n.language);
  const row = (workout: WorkoutSummary, days: readonly number[] = []) => {
    const title = displayTitle(
      workout.title,
      workout.exercises.flatMap((entry) =>
        entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
      ),
      (key) => t(key),
    );
    const has = workout.exercises.some((entry) => entry.exerciseId === exerciseId);
    return (
      <ListRow
        key={workout.id}
        title={title}
        description={
          days.length > 0
            ? t("training__picker_days", {
                count: days.length,
                days: days.map(integer.format).join(", "),
              })
            : undefined
        }
        value={has ? t("training__already_in") : undefined}
        accessory="none"
        disabled={has}
        onPress={() => void add(workout.id, title)}
      />
    );
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <FixedSheetContent
          fraction={0.6}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
        >
          <View className="px-5 pb-3 pt-2">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("training__add_to_workout")}
            </BottomSheet.Title>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingBottom: bottom + 16 }}
          >
            <ListSection>
              <ListRow
                icon={Plus}
                title={t("training__new_with_exercise")}
                accessory="none"
                onPress={() => {
                  onOpenChange(false);
                  void withExercises([exerciseId]);
                }}
              />
            </ListSection>
            {status === "list" ? (
              <>
                {standalone.length > 0 ? (
                  <ListSection title={t("training__standalone_workouts")}>
                    {standalone.map((workout) => row(workout))}
                  </ListSection>
                ) : null}
                {programList.programs.map((program) => {
                  const entries = groups.get(program.id);
                  if (!entries?.length) return null;
                  const daysByWorkout = new Map<string, number[]>();
                  program.slots.forEach(({ workoutId }, index) => {
                    if (workoutId === null) return;
                    const days = daysByWorkout.get(workoutId) ?? [];
                    days.push(index + 1);
                    daysByWorkout.set(workoutId, days);
                  });
                  const byId = new Map(entries.map((entry) => [entry.id, entry]));
                  const scheduled = [...daysByWorkout].flatMap(([id, days]) => {
                    const entry = byId.get(id);
                    byId.delete(id);
                    return entry ? [row(entry, days)] : [];
                  });
                  return (
                    <ListSection key={program.id} title={program.title}>
                      {scheduled}
                      {[...byId.values()].map((entry) => row(entry))}
                    </ListSection>
                  );
                })}
              </>
            ) : null}
            {status === "error" ? (
              <ListSection>
                <ListRow
                  title={t("training__retry")}
                  onPress={() => {
                    workoutList.retry();
                    programList.retry();
                  }}
                />
              </ListSection>
            ) : null}
            {status === "loading" ? <ActivityIndicator /> : null}
            {(status === "list" && workouts.length === 0) ||
            status === "empty" ||
            isFirstSync(status) ? (
              <Text className="font-normal px-1 text-center text-caption text-muted">
                {t("training__add_to_empty")}
              </Text>
            ) : null}
          </BottomSheetScrollView>
        </FixedSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
