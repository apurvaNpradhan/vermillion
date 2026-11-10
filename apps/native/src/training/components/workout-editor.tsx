import { TRAINING_LIMITS } from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import { Copy, DotsThreeVertical, Plus, Swap, Trash, WarningCircle } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePickExercises } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page, ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { displayTitle } from "../derived-title";
import { useCoalescedWriter } from "../use-coalesced-writer";
import { useWorkout } from "../use-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { ReorderList } from "./reorder-list";
import { SavedTextField } from "./saved-text-field";
import { WorkoutExerciseRow } from "./workout-exercise-row";
import { WorkoutNote } from "./workout-note";

/** Where the editor sends the user. */
export type WorkoutEditorProps = {
  id: string;
  /** Open the exercise sheet of one row. */
  onOpenExercise: (entryId: string) => void;
  /** The Workout was deleted: leave the screen. */
  onClosed: () => void;
  /** A copy was made: open it in place of this one. */
  onOpenCopy: (id: string) => void;
};

/**
 * One Workout: its name and note, then its exercises as summary rows that reorder by long press.
 * Every edit is saved as it happens; there is no Save. All data comes through the module hooks.
 */
export function WorkoutEditorScreen(props: WorkoutEditorProps) {
  const { t } = useTranslation();
  const state = useWorkout(props.id);

  if (state.status === "loading") {
    return (
      <ScrollPage title={t("training__workout")} back>
        <Skeleton label={t("common__loading")} className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </ScrollPage>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <ScrollPage title={t("training__workout")} back>
        <EmptyState
          icon={WarningCircle}
          title={t(
            state.status === "missing" ? "training__workout_missing" : "training__load_failed",
          )}
        />
      </ScrollPage>
    );
  }
  return <LoadedEditor workout={state.workout} {...props} />;
}

type Loaded = NonNullable<Extract<ReturnType<typeof useWorkout>, { status: "ready" }>["workout"]>;

function LoadedEditor({
  workout,
  onOpenExercise,
  onClosed,
  onOpenCopy,
}: WorkoutEditorProps & { workout: Loaded }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  const actions = useWorkoutActions();
  const pickExercises = usePickExercises("train");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<WorkoutExerciseDetail | null>(null);
  const [dragging, setDragging] = useState(false);

  const title = displayTitle(
    workout.title,
    workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise.primaryMuscle] : [])),
    (key) => t(key),
  );
  const writer = useCoalescedWriter((patch: { title?: string | null; note?: string | null }) =>
    actions.update(workout.id, patch),
  );
  const exerciseIds = useMemo(
    () => workout.exercises.map((entry) => entry.exerciseId),
    [workout.exercises],
  );

  const addExercises = async () => {
    const picked = await pickExercises({ exclude: exerciseIds });
    if (picked && picked.length > 0) await actions.append(workout.id, picked);
  };
  const replaceRow = async (entry: WorkoutExerciseDetail) => {
    const picked = await pickExercises({ max: 1, exclude: exerciseIds, swapFor: entry.exerciseId });
    const next = picked?.[0];
    if (next) await actions.replace(entry, next);
  };

  const menu: SwipeAction[] = [
    {
      key: "duplicate",
      label: t("training__duplicate"),
      icon: Copy,
      onPress: () => {
        writer.flush();
        void actions.duplicate(workout.id, workout.title).then((copy) => {
          if (copy) onOpenCopy(copy);
        });
      },
    },
    {
      key: "delete",
      label: t("training__delete"),
      icon: Trash,
      tone: "danger",
      onPress: () => {
        void actions.remove(workout.id, title).then((removed) => {
          if (removed) onClosed();
        });
      },
    },
  ];
  const rowActions: SwipeAction[] = rowMenu
    ? [
        {
          key: "replace",
          label: t("training__replace"),
          icon: Swap,
          onPress: () => void replaceRow(rowMenu),
        },
        {
          key: "remove",
          label: t("training__remove"),
          icon: Trash,
          tone: "danger",
          onPress: () =>
            void actions.removeExercise(
              rowMenu,
              rowMenu.exercise?.title ?? t("training__exercise_missing"),
            ),
        },
      ]
    : [];

  return (
    <>
      <Page
        title={title}
        back
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("training__workout_menu")}
            onPress={() => setMenuOpen(true)}
            className="h-11 w-11 items-center justify-center"
          >
            <DotsThreeVertical size={22} weight="bold" color={foreground} />
          </Pressable>
        }
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <Animated.ScrollView
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            contentContainerClassName="gap-4"
            scrollEnabled={!dragging}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <View className="px-4">{header}</View>
            <View className="gap-3 px-4">
              <SavedTextField
                label={t("training__name_label")}
                value={workout.title}
                onText={(next) => writer.queue({ title: next })}
                placeholder={title}
                maxLength={TRAINING_LIMITS.titleMax}
                returnKeyType="done"
              />
              <WorkoutNote value={workout.note} onText={(next) => writer.queue({ note: next })} />
            </View>
            <ReorderList
              items={workout.exercises}
              onDraggingChange={setDragging}
              onMove={(id, beforeId) => void actions.move(id, beforeId)}
              renderItem={(entry, { collapsed }) => (
                <WorkoutExerciseRow
                  entry={entry}
                  collapsed={collapsed}
                  onOpen={(row) => {
                    writer.flush();
                    onOpenExercise(row.id);
                  }}
                  onMenu={setRowMenu}
                />
              )}
            />
            <View className="px-4">
              <Button
                variant={workout.exercises.length === 0 ? "primary" : "secondary"}
                isDisabled={workout.exercises.length >= TRAINING_LIMITS.exercisesPerWorkout}
                onPress={() => void addExercises()}
              >
                <Plus size={16} color={foreground} weight="bold" />
                <Button.Label>{t("training__add_exercises")}</Button.Label>
              </Button>
            </View>
          </Animated.ScrollView>
        )}
      </Page>
      <ActionSheet title={title} actions={menu} isOpen={menuOpen} onOpenChange={setMenuOpen} />
      <ActionSheet
        title={rowMenu?.exercise?.title ?? ""}
        actions={rowActions}
        isOpen={rowMenu !== null}
        onOpenChange={(open) => {
          if (!open) setRowMenu(null);
        }}
      />
    </>
  );
}
