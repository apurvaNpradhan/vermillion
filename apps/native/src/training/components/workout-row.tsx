import { derivedTitleMuscles } from "@workspace/shared";
import type { WorkoutSummary } from "@workspace/sync";
import { Barbell, CaretRight, Copy, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { MuscleIcon } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

import { displayTitle } from "../derived-title";
import { estimateMinutes } from "../estimate";

const TILE = 48;

/** One standalone Workout: a tile of its main muscle group, its name and `6 exercises · ~55 min`. */
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
  const subtle = useSubtleColor();
  const muscles = workout.exercises.flatMap((entry) =>
    entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
  );
  const title = displayTitle(workout.title, muscles, (key) => t(key));
  const main = derivedTitleMuscles(muscles)[0];
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
    <SwipeRow actions={swipe}>
      {(a11y) => (
        <Pressable
          {...a11y}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${meta}`}
          onPress={() => onOpen(workout.id)}
          className="min-h-[72px] flex-row items-center gap-3 border-b border-border bg-background px-4 py-3 active:bg-default"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="items-center justify-center rounded-xl bg-default"
            style={{ width: TILE, height: TILE }}
          >
            {main ? (
              <MuscleIcon muscle={main} size={TILE - 8} />
            ) : (
              <Barbell size={24} color={subtle} />
            )}
          </View>
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="font-medium text-body text-foreground">
              {title}
            </Text>
            <Text numberOfLines={1} className="text-caption text-muted">
              {meta}
            </Text>
          </View>
          <CaretRight size={18} color={subtle} />
        </Pressable>
      )}
    </SwipeRow>
  );
});
