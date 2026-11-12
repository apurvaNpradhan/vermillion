import type { WorkoutSummary } from "@workspace/sync";
import { Copy, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { displayTitle } from "../derived-title";
import { PlanRow } from "./plan-row";

/**
 * A flat workout row: its title, the exercises on one muted line, when it was last done and a
 * compact Start button on the right.
 */
export const WorkoutRow = memo(function WorkoutRow({
  workout,
  lastDone,
  onOpen,
  onStart,
  onDuplicate,
  onDelete,
}: {
  workout: WorkoutSummary;
  /** "Last done 2 days ago", or null when it is not in recent history. */
  lastDone: string | null;
  onOpen: (id: string) => void;
  onStart: (id: string) => void;
  onDuplicate: (workout: WorkoutSummary, title: string) => void;
  onDelete: (id: string, title: string) => void;
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
        key: "duplicate",
        label: t("training__duplicate"),
        icon: Copy,
        onPress: () => onDuplicate(workout, title),
      },
      {
        key: "delete",
        label: t("training__delete"),
        icon: Trash,
        tone: "danger",
        onPress: () => onDelete(workout.id, title),
      },
    ],
    [t, onDuplicate, onDelete, workout, title],
  );

  return (
    <PlanRow
      title={title}
      lines={[exercises, lastDone]}
      trailing={
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full px-4"
          accessibilityLabel={t("training__start_workout_named", { title })}
          onPress={() => onStart(workout.id)}
        >
          <Button.Label>{t("training__start")}</Button.Label>
        </Button>
      }
      onOpen={() => onOpen(workout.id)}
      actions={swipe}
    />
  );
});
