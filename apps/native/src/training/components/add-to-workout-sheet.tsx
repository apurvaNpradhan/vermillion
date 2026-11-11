import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { Plus } from "phosphor-react-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { Skeleton } from "@/platform/ui/skeleton";

import { displayTitle } from "../derived-title";
import { useStartWorkout } from "../use-start-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { useWorkouts } from "../use-workouts";

/**
 * "Add to workout" from an exercise's detail screen: the standalone Workouts, each one a tap
 * away, and "New workout with this exercise". A Workout that already holds the exercise is
 * greyed out.
 */
export function AddToWorkoutSheet({
  exerciseId,
  isOpen,
  onOpenChange,
}: {
  exerciseId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { bottom } = useSafeAreaInsets();
  const { status, workouts } = useWorkouts();
  const actions = useWorkoutActions();
  const { withExercises } = useStartWorkout();

  const add = async (id: string, title: string) => {
    onOpenChange(false);
    if (await actions.append(id, [exerciseId])) {
      toast.show({ label: t("training__added_toast", { title }) });
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["60%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="h-full"
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
            {status === "loading" ? (
              <Skeleton label={t("common__loading")} className="h-12 w-full" />
            ) : null}
            {status === "list" ? (
              <ListSection title={t("training__workouts")}>
                {workouts.map((workout) => {
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
                      value={has ? t("training__already_in") : undefined}
                      accessory="none"
                      disabled={has}
                      onPress={() => void add(workout.id, title)}
                    />
                  );
                })}
              </ListSection>
            ) : null}
            {status === "empty" || status === "first-sync" ? (
              <Text className="px-1 text-center text-caption text-muted">
                {t("training__add_to_empty")}
              </Text>
            ) : null}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
