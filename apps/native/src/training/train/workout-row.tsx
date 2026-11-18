import type { WorkoutSummary } from "@workspace/sync";
import { Copy, PencilSimple, Play, ShareNetwork, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { displayTitle } from "@/training/workouts/derived-title";
import { PlanRow } from "@/training/shared/plan-row";

/**
 * A flat workout row: its title, the exercises on one muted line and when it was last done. A
 * swipe reveals Start and Edit; the options button and a long press list those and Share,
 * Duplicate and Delete, and screen readers get every one of them as an action on the row.
 * A Workout a Program owns has no Duplicate or Delete: those happen in the Program.
 */
export const WorkoutRow = memo(function WorkoutRow({
  workout,
  lastDone,
  onOpen,
  onStart,
  onEdit,
  onShare,
  onDuplicate,
  onDelete,
}: {
  workout: WorkoutSummary;
  /** "Last done 2 days ago", or null when it is not in recent history. */
  lastDone: string | null;
  onOpen: (id: string) => void;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onShare: (id: string) => void;
  /** Absent for a Workout a Program owns: copying and deleting it happen in the Program. */
  onDuplicate?: (workout: WorkoutSummary, title: string) => void;
  onDelete?: (id: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const muscles = workout.exercises.flatMap((entry) =>
    entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
  );
  const title = displayTitle(workout.title, muscles, (key) => t(key));
  const exercises =
    workout.exercises.length === 0
      ? t("training__workout_empty_meta")
      : workout.exercises.map((entry) => entry.title ?? t("training__exercise_missing")).join(", ");

  const swipe = useMemo<SwipeAction[]>(
    () => [
      {
        key: "start",
        label: t("training__start"),
        icon: Play,
        onPress: () => onStart(workout.id),
      },
      {
        key: "edit",
        label: t("training__edit"),
        icon: PencilSimple,
        onPress: () => onEdit(workout.id),
      },
    ],
    [t, onStart, onEdit, workout.id],
  );
  const menu = useMemo<SwipeAction[]>(
    () => [
      ...swipe,
      {
        key: "share",
        label: t("share__share"),
        icon: ShareNetwork,
        onPress: () => onShare(workout.id),
      },
      ...(onDuplicate
        ? [
            {
              key: "duplicate",
              label: t("training__duplicate"),
              icon: Copy,
              onPress: () => onDuplicate(workout, title),
            },
          ]
        : []),
      ...(onDelete
        ? [
            {
              key: "delete",
              label: t("training__delete"),
              icon: Trash,
              tone: "danger" as const,
              onPress: () => onDelete(workout.id, title),
            },
          ]
        : []),
    ],
    [swipe, t, onShare, onDuplicate, onDelete, workout, title],
  );

  return (
    <PlanRow
      title={title}
      lines={[exercises, lastDone]}
      menuLabel={t("training__workout_menu")}
      onOpen={() => onOpen(workout.id)}
      actions={swipe}
      menuActions={menu}
    />
  );
});
