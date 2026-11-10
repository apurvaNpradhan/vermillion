import type { WorkoutExerciseDetail } from "@workspace/sync";
import { DotsSixVertical, DotsThreeVertical } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { summariseSets } from "../summarise-sets";
import { useSummaryLabels } from "../use-summary-labels";
import { useTrainingPreferences } from "../use-training-preferences";

const FALLBACK_TYPE = "weight_reps";

/**
 * One exercise of a Workout as a summary row: thumbnail, name, `3 × 8–10 · RPE 8–9 · 2:00` and
 * the pinned note. While the list is dragged it is a single line.
 */
export const WorkoutExerciseRow = memo(function WorkoutExerciseRow({
  entry,
  collapsed,
  onOpen,
  onMenu,
}: {
  entry: WorkoutExerciseDetail;
  collapsed: boolean;
  onOpen: (entry: WorkoutExerciseDetail) => void;
  onMenu: (entry: WorkoutExerciseDetail) => void;
}) {
  const { t } = useTranslation();
  const labels = useSummaryLabels();
  const { weightUnit, effortScale } = useTrainingPreferences();
  const subtle = useSubtleColor();
  const info = entry.exercise;
  const name = info?.title ?? t("training__exercise_missing");
  const summary = summariseSets(
    entry.sets,
    info?.exerciseType ?? FALLBACK_TYPE,
    entry.restSeconds,
    { weightUnit, effortScale },
    labels,
  );
  const thumbnail = (size: number) =>
    info ? (
      <ExerciseThumbnail thumbnailKey={info.thumbnailKey} muscle={info.primaryMuscle} size={size} />
    ) : (
      <View className="rounded-lg bg-default" style={{ width: size, height: size }} />
    );

  if (collapsed) {
    return (
      <View className="h-14 flex-row items-center gap-3 border-b border-border bg-surface px-4">
        {thumbnail(32)}
        <Text numberOfLines={1} className="flex-1 font-medium text-body text-foreground">
          {name}
        </Text>
        <DotsSixVertical size={20} color={subtle} weight="bold" />
      </View>
    );
  }
  return (
    <View className="min-h-[72px] flex-row items-center border-b border-border bg-background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${summary}${entry.note ? `, ${entry.note}` : ""}`}
        accessibilityHint={t("training__row_open_hint")}
        onPress={() => onOpen(entry)}
        className="min-h-[72px] flex-1 flex-row items-center gap-3 py-2 pl-4 active:bg-default"
      >
        {thumbnail(48)}
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-medium text-body text-foreground">
            {name}
          </Text>
          <Text
            numberOfLines={2}
            className="text-caption text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {summary}
          </Text>
          {entry.note ? (
            <Text numberOfLines={2} className="text-caption text-muted">
              {entry.note}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("training__row_menu", { title: name })}
        onPress={() => onMenu(entry)}
        hitSlop={4}
        className="h-12 w-12 items-center justify-center"
      >
        <DotsThreeVertical size={20} color={subtle} weight="bold" />
      </Pressable>
    </View>
  );
});
