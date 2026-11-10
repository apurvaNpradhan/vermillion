import type { WorkoutSummary } from "@workspace/sync";
import { Copy, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";

import { useTranslation } from "@/platform/i18n";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { displayTitle } from "../derived-title";
import { estimateMinutes } from "../estimate";
import { PlanInitialTile } from "./plan-initial-tile";
import { PlanRow } from "./plan-row";

/**
 * A compact workout row, matching programs with a title initial and one metadata line.
 */
export const WorkoutRow = memo(function WorkoutRow({
  workout,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  workout: WorkoutSummary;
  onOpen: (id: string) => void;
  onDuplicate: (workout: WorkoutSummary, title: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const muscles = workout.exercises.flatMap((entry) =>
    entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
  );
  const title = displayTitle(workout.title, muscles, (key) => t(key));
  const count = workout.exercises.length;
  const meta =
    count === 0
      ? t("training__workout_empty_meta")
      : t("training__workout_meta", { count, minutes: estimateMinutes(workout.exercises) });

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
      meta={meta}
      tile={<PlanInitialTile title={title} size={36} />}
      menuLabel={t("training__workout_menu")}
      onOpen={() => onOpen(workout.id)}
      actions={swipe}
    />
  );
});
