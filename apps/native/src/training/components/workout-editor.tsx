import { TRAINING_LIMITS, supersetPlaces } from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import {
  Copy,
  DotsThreeVertical,
  FloppyDisk,
  Link,
  LinkBreak,
  ListPlus,
  PlayCircle,
  Plus,
  PencilSimple,
  ShareNetwork,
  Swap,
  Trash,
  WarningCircle,
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Keyboard, Pressable, Text, View, type ScrollView } from "react-native";
import { CaretDown, CaretUp } from "phosphor-react-native";
import Animated from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(KeyboardAwareScrollView);

import { BodyMapPair } from "@/body-map";
import { workoutMuscles } from "../workout-muscles";
import { MUSCLE_GROUP_KEYS } from "@workspace/shared";
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
import { useProgramActions } from "../use-program-actions";
import { useSharePlan } from "../use-share-plan";
import { useWorkout } from "../use-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { AddToProgramSheet } from "./add-to-program-sheet";
import { HideWhileDragging } from "./hide-while-dragging";
import { ReorderList } from "./reorder-list";
import { useReorderScroll } from "../use-reorder-scroll";
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
  /** Start a Session from this Workout. */
  onStart: (id: string) => void;
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
  onStart,
}: WorkoutEditorProps & { workout: Loaded }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  const actions = useWorkoutActions();
  const programActions = useProgramActions();
  const { shareWorkout } = useSharePlan();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [programSheet, setProgramSheet] = useState(false);
  const pickExercises = usePickExercises("train");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<WorkoutExerciseDetail | null>(null);
  const reorderScroll = useReorderScroll();

  const title = displayTitle(
    workout.title,
    workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise.primaryMuscle] : [])),
    (key) => t(key),
  );
  const writer = useCoalescedWriter((patch: { title?: string | null; note?: string | null }) =>
    actions.update(workout.id, patch),
  );
  const places = useMemo(
    () =>
      new Map(
        supersetPlaces(workout.exercises, (entry) => entry.supersetGroup).map(
          (place, index) => [workout.exercises[index]?.id ?? "", place] as const,
        ),
      ),
    [workout.exercises],
  );
  const muscles = workoutMuscles(
    workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise] : [])),
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

  const remove: SwipeAction = {
    key: "delete",
    label: t("training__delete"),
    icon: Trash,
    tone: "danger",
    onPress: () => {
      void actions.remove(workout.id, title).then((removed) => {
        if (removed) onClosed();
      });
    },
  };
  const share: SwipeAction = {
    key: "share",
    label: t("training__share_as_text"),
    icon: ShareNetwork,
    onPress: () => {
      writer.flush();
      void shareWorkout(workout.id, title);
    },
  };
  // A Workout of a Program leaves it only by a copy; a standalone one can be copied into one.
  const menu: SwipeAction[] =
    workout.programId === null
      ? [
          share,
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
            key: "add-to-program",
            label: t("training__add_to_program"),
            icon: ListPlus,
            onPress: () => {
              writer.flush();
              setProgramSheet(true);
            },
          },
          remove,
        ]
      : [
          share,
          {
            key: "standalone",
            label: t("training__save_standalone"),
            icon: FloppyDisk,
            onPress: () => {
              writer.flush();
              void programActions.saveAsStandalone(workout.id);
            },
          },
          remove,
        ];
  const rowPlace = rowMenu ? (places.get(rowMenu.id) ?? "none") : "none";
  const rowIndex = rowMenu ? workout.exercises.findIndex((entry) => entry.id === rowMenu.id) : -1;
  // "With next" needs a next row that is not already in the same run.
  const canJoin =
    rowIndex >= 0 &&
    rowIndex < workout.exercises.length - 1 &&
    (rowPlace === "none" || rowPlace === "last");
  const rowActions: SwipeAction[] = rowMenu
    ? [
        {
          key: "details",
          label: t("training__exercise_details"),
          icon: PencilSimple,
          onPress: () => {
            writer.flush();
            onOpenExercise(rowMenu.id);
          },
        },
        ...(canJoin
          ? [
              {
                key: "superset",
                label: t("training__superset_with_next"),
                icon: Link,
                onPress: () => void actions.superset(rowMenu.id),
              },
            ]
          : []),
        ...(rowPlace === "none"
          ? []
          : [
              {
                key: "leave-superset",
                label: t("training__superset_remove"),
                icon: LinkBreak,
                onPress: () => void actions.leaveSuperset(rowMenu.id),
              },
            ]),
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
          <AnimatedKeyboardAwareScrollView
            bottomOffset={24}
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            contentContainerClassName="gap-4"
            ref={(node: ScrollView | null) => {
              scroll.ref(node);
              reorderScroll.ref(node);
            }}
            animatedProps={reorderScroll.animatedProps}
            onContentSizeChange={reorderScroll.onContentSizeChange}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View className="px-4">{header}</View>
            <View className="gap-3 px-4">
              {editingDetails ? (
                <>
                  <SavedTextField
                    label={t("training__name_label")}
                    value={workout.title}
                    onText={(next) => writer.queue({ title: next })}
                    placeholder={title}
                    maxLength={TRAINING_LIMITS.titleMax}
                    returnKeyType="next"
                  />
                  <WorkoutNote
                    value={workout.note}
                    onText={(next) => writer.queue({ note: next })}
                  />
                  <Button
                    variant="secondary"
                    onPress={() => {
                      writer.flush();
                      Keyboard.dismiss();
                      setEditingDetails(false);
                    }}
                  >
                    <Button.Label>{t("training__effort_done")}</Button.Label>
                  </Button>
                </>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showMore }}
              accessibilityLabel={t(showMore ? "training__show_less" : "training__show_more")}
              onPress={() => setShowMore((open) => !open)}
              className="mx-4 h-11 flex-row items-center justify-between"
            >
              <Text className="font-medium text-label text-foreground">
                {t(showMore ? "training__show_less" : "training__show_more")}
              </Text>
              {showMore ? (
                <CaretUp size={16} color={foreground} weight="bold" />
              ) : (
                <CaretDown size={16} color={foreground} weight="bold" />
              )}
            </Pressable>
            {showMore ? (
              <View className="gap-3 px-4">
                {workout.note && !editingDetails ? (
                  <Text className="text-body text-muted">{workout.note}</Text>
                ) : null}
                <View className="flex-row items-center gap-4">
                  <BodyMapPair
                    primary={muscles.primary}
                    secondary={muscles.secondary}
                    gap={8}
                    style={{ width: 112 }}
                  />
                  <View className="flex-1 gap-2">
                    <Text className="font-medium text-label text-foreground">
                      {t("training__muscles_trained")}
                    </Text>
                    <Text className="text-caption text-muted">
                      {muscles.primary.map((muscle) => t(MUSCLE_GROUP_KEYS[muscle])).join(" · ") ||
                        t("bodymap__none")}
                    </Text>
                    {muscles.secondary.length > 0 ? (
                      <Text className="text-caption text-muted">
                        {t("training__assisting_muscles", {
                          names: muscles.secondary
                            .map((muscle) => t(MUSCLE_GROUP_KEYS[muscle]))
                            .join(" · "),
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
            <ReorderList
              items={workout.exercises}
              scroll={reorderScroll}
              topInset={contentContainerStyle.paddingTop}
              bottomInset={contentContainerStyle.paddingBottom}
              onMove={(id, beforeId) => void actions.move(id, beforeId)}
              renderItem={(entry, { collapsed }) => (
                <WorkoutExerciseRow
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === entry.id ? null : entry.id))
                  }
                  collapsed={collapsed}
                  place={places.get(entry.id) ?? "none"}
                  onMenu={setRowMenu}
                />
              )}
            />
            <HideWhileDragging dragging={reorderScroll.dragging}>
              {workout.exercises.length === 0 ? (
                <EmptyState
                  icon={Plus}
                  title={t("training__workout_empty_meta")}
                  action={{
                    label: t("training__add_exercises"),
                    onPress: () => void addExercises(),
                  }}
                />
              ) : (
                <View className="px-4">
                  <Button
                    variant="secondary"
                    isDisabled={workout.exercises.length >= TRAINING_LIMITS.exercisesPerWorkout}
                    onPress={() => void addExercises()}
                  >
                    <Plus size={16} color={foreground} weight="bold" />
                    <Button.Label>{t("training__add_exercises")}</Button.Label>
                  </Button>
                </View>
              )}
            </HideWhileDragging>
          </AnimatedKeyboardAwareScrollView>
        )}
      </Page>
      <ActionSheet
        title={title}
        actions={[
          // Temporary: the Workout preview with Start replaces this in a later slice.
          {
            key: "start",
            label: t("session__start"),
            icon: PlayCircle,
            onPress: () => {
              writer.flush();
              onStart(workout.id);
            },
          },
          {
            key: "rename",
            label: t("training__edit_details"),
            icon: PencilSimple,
            onPress: () => setEditingDetails(true),
          },
          ...menu,
        ]}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
      />
      <AddToProgramSheet
        workoutId={workout.id}
        isOpen={programSheet}
        onOpenChange={setProgramSheet}
      />
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
