import { ReorderBlock, ReorderTrigger } from "@/training/reorder/reorder-block";
import type { TranslationKey } from "@workspace/i18n";
import type { ProgramSlotDetail } from "@workspace/sync";
import { Check, DotsThreeVertical, Minus, Moon, PencilSimple } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";
import { WorkoutTile } from "@/training/shared/workout-tile";
import { displayTitle } from "@/platform/training/derived-title";
import { estimateMinutes } from "@/training/workouts/estimate";

const TILE = 44;

/** The name a Slot's Workout shows, as in the lists: its own title or the muscles it hits. */
export function slotTitle(slot: ProgramSlotDetail, t: (key: TranslationKey) => string) {
  const muscles =
    slot.workout?.exercises.flatMap((entry) =>
      entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
    ) ?? [];
  return displayTitle(slot.workout?.title ?? null, muscles, (key) => t(key));
}

/**
 * One Slot of the Rotation: its day number, then the Workout (title initial, name, `6 exercises · ~55 min`,
 * and `×2` when it fills several Slots) or a quiet Rest row. Holding the row
 * opens the Reorder view.
 */
export const RotationRow = memo(function RotationRow({
  slot,
  number,
  title,
  repeats,
  cycleState,
  onReorder,
  onOpen,
  onEdit,
  onMenu,
}: {
  slot: ProgramSlotDetail;
  /** The day, from 1. */
  number: number;
  /** The Workout's display name; unused for Rest. */
  title: string;
  /** How many Slots the Workout fills; 1 shows no badge. */
  repeats: number;
  /** For the active Program: done or skipped for the current Cycle; null otherwise. */
  cycleState?: "done" | "skipped" | null;
  /** Long press on the row: open the Reorder view. */
  onReorder: () => void;
  onOpen: (slot: ProgramSlotDetail) => void;
  onEdit: (workoutId: string) => void;
  onMenu: (slot: ProgramSlotDetail) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const workout = slot.workout;
  const name = workout ? title : t("training__rest_day");
  const reorderActions = {
    accessibilityActions: [{ name: "reorder", label: t("training__reorder") }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "reorder") onReorder();
    },
  };

  const swipe = useMemo<SwipeAction[]>(
    () =>
      slot.workoutId === null
        ? []
        : [
            {
              key: "edit",
              label: t("training__edit_workout"),
              icon: PencilSimple,
              onPress: () => {
                if (slot.workoutId !== null) onEdit(slot.workoutId);
              },
            },
          ],
    [onEdit, slot.workoutId, t],
  );

  const menu = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("training__slot_menu", { number })}
      onPress={() => onMenu(slot)}
      hitSlop={4}
      className="h-12 w-12 items-center justify-center"
    >
      <DotsThreeVertical size={20} color={subtle} />
    </Pressable>
  );

  if (!workout) {
    return (
      <ReorderBlock onReorder={onReorder}>
        <ReorderTrigger
          accessible={false}
          className="min-h-[72px] flex-row items-center bg-background"
        >
          <View
            accessibilityLabel={t("training__slot_rest_label", { number })}
            accessibilityHint={t("training__drag_hint")}
            {...reorderActions}
            accessible
            className="min-h-[72px] flex-1 flex-row items-center gap-3 pl-4"
          >
            <Text
              className="w-8 text-center text-label font-semibold text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {number}
            </Text>
            <View
              className="items-center justify-center rounded-lg"
              style={{ width: TILE, height: TILE }}
            >
              <Moon size={20} color={subtle} />
            </View>
            <Text className="font-normal flex-1 text-body text-muted">{name}</Text>
          </View>
          {menu}
        </ReorderTrigger>
      </ReorderBlock>
    );
  }

  const count = workout.exercises.length;
  const meta =
    count === 0
      ? t("training__workout_empty_meta")
      : t("training__workout_meta", { count, minutes: estimateMinutes(workout.exercises) });

  return (
    <SwipeRow actions={swipe}>
      {(a11y) => (
        <ReorderBlock onReorder={onReorder}>
          <ReorderTrigger className="min-h-[72px] flex-row items-center bg-background">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("training__slot_label", { number, title })}, ${meta}${
                repeats > 1 ? `, ${t("training__repeat_badge_label", { count: repeats })}` : ""
              }${
                cycleState
                  ? `, ${t(cycleState === "done" ? "run__done_this_cycle" : "run__skipped_this_cycle")}`
                  : ""
              }`}
              accessibilityHint={`${t("training__slot_open_hint")}. ${t("training__drag_hint")}`}
              accessibilityActions={[
                ...reorderActions.accessibilityActions,
                ...a11y.accessibilityActions,
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "reorder")
                  reorderActions.onAccessibilityAction(event);
                else a11y.onAccessibilityAction(event);
              }}
              onPress={() => onOpen(slot)}
              className="min-h-[72px] flex-1 flex-row items-center gap-3 py-2 pl-4 active:bg-default"
            >
              <Text
                className="w-8 text-center text-label font-semibold text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {number}
              </Text>
              <WorkoutTile
                title={title}
                size={TILE}
                coverMediaId={workout.coverMediaId}
                exercises={workout.exercises}
              />
              <View className="flex-1 gap-0.5">
                <Text numberOfLines={2} className="font-medium text-body text-foreground">
                  {title}
                </Text>
                <Text numberOfLines={1} className="font-normal text-caption text-muted">
                  {meta}
                </Text>
              </View>
              {cycleState ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-6 w-6 items-center justify-center rounded-full bg-default"
                >
                  {cycleState === "done" ? (
                    <Check size={16} weight="bold" color={subtle} />
                  ) : (
                    <Minus size={16} weight="bold" color={subtle} />
                  )}
                </View>
              ) : null}
              {repeats > 1 ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="rounded-full bg-default px-2 py-0.5"
                >
                  <Text
                    className="font-normal text-caption text-muted"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {t("training__repeat_badge", { count: repeats })}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {menu}
          </ReorderTrigger>
        </ReorderBlock>
      )}
    </SwipeRow>
  );
});
