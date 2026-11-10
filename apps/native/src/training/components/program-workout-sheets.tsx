import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import { Plus } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { Skeleton } from "@/platform/ui/skeleton";

import { displayTitle } from "../derived-title";
import { useWorkouts } from "../use-workouts";

/** A Workout of the Program that the sheets offer: one row, however many Slots it fills. */
export type ProgramWorkoutChoice = { id: string; title: string | null; displayTitle: string };

function Sheet({
  title,
  isOpen,
  onOpenChange,
  children,
}: {
  title: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const { bottom } = useSafeAreaInsets();
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
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingBottom: bottom + 16 }}
          >
            {children}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

/**
 * "Add workout" for a Program: a new Workout built from the exercise picker and owned by the
 * Program, or a copy of one of your standalone Workouts or of one of this Program's. A copy is
 * independent: editing it never changes the original.
 */
export function AddWorkoutSheet({
  isOpen,
  onOpenChange,
  own,
  onNew,
  onCopyStandalone,
  onCopyOwn,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  own: readonly ProgramWorkoutChoice[];
  onNew: () => void;
  onCopyStandalone: (workoutId: string) => void;
  onCopyOwn: (choice: ProgramWorkoutChoice) => void;
}) {
  const { t } = useTranslation();
  const { status, workouts } = useWorkouts();
  const close = () => onOpenChange(false);
  return (
    <Sheet title={t("training__add_workout")} isOpen={isOpen} onOpenChange={onOpenChange}>
      <ListSection>
        <ListRow
          icon={Plus}
          title={t("training__new_workout")}
          accessory="none"
          onPress={() => {
            close();
            onNew();
          }}
        />
      </ListSection>
      {status === "loading" ? (
        <Skeleton label={t("common__loading")} className="h-12 w-full" />
      ) : null}
      {status === "list" ? (
        <ListSection title={t("training__add_workout_yours")}>
          {workouts.map((workout) => (
            <ListRow
              key={workout.id}
              title={displayTitle(
                workout.title,
                workout.exercises.flatMap((entry) =>
                  entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
                ),
                (key) => t(key),
              )}
              accessory="none"
              onPress={() => {
                close();
                onCopyStandalone(workout.id);
              }}
            />
          ))}
        </ListSection>
      ) : null}
      {own.length > 0 ? (
        <ListSection title={t("training__add_workout_this")}>
          {own.map((choice) => (
            <ListRow
              key={choice.id}
              title={choice.displayTitle}
              accessory="none"
              onPress={() => {
                close();
                onCopyOwn(choice);
              }}
            />
          ))}
        </ListSection>
      ) : null}
      {status !== "list" && status !== "loading" && own.length === 0 ? (
        <Text className="px-1 text-center text-caption text-muted">
          {t("training__add_workout_none")}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** "Repeat a workout": one of this Program's Workouts for another Slot (the same Workout). */
export function RepeatWorkoutSheet({
  isOpen,
  onOpenChange,
  own,
  onPick,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  own: readonly ProgramWorkoutChoice[];
  onPick: (workoutId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet title={t("training__repeat_title")} isOpen={isOpen} onOpenChange={onOpenChange}>
      {own.length === 0 ? (
        <Text className="px-1 text-center text-caption text-muted">
          {t("training__repeat_empty")}
        </Text>
      ) : (
        <ListSection>
          {own.map((choice) => (
            <ListRow
              key={choice.id}
              title={choice.displayTitle}
              accessory="none"
              onPress={() => {
                onOpenChange(false);
                onPick(choice.id);
              }}
            />
          ))}
        </ListSection>
      )}
    </Sheet>
  );
}
