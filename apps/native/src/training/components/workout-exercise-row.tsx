import type { SupersetPlace } from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { DotsSixVertical, DotsThreeVertical } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { InlineTargets } from "./inline-targets";
import { summariseSets } from "../summarise-sets";
import { useSummaryLabels } from "../use-summary-labels";
import { useTrainingPreferences } from "../use-training-preferences";

const FALLBACK_TYPE = "weight_reps";

/**
 * The left bracket of a superset in the `identity` role: one bar that runs through the run's rows,
 * rounded where the run starts and ends.
 */
function SupersetBracket({ place }: { place: SupersetPlace }) {
  if (place === "none") return null;
  const edges =
    place === "first"
      ? "top-3 bottom-0 rounded-t-full"
      : place === "last"
        ? "top-0 bottom-3 rounded-b-full"
        : "top-0 bottom-0";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className={`absolute left-2.5 w-[3px] bg-identity ${edges}`}
    />
  );
}

/**
 * One exercise of a Workout as a summary row: thumbnail, name, `3 × 8–10 · RPE 8–9 · 2:00` and
 * the pinned note. While the list is dragged it is a single line.
 */
export const WorkoutExerciseRow = memo(function WorkoutExerciseRow({
  entry,
  expanded,
  onToggle,
  collapsed,
  place,
  onMenu,
}: {
  entry: WorkoutExerciseDetail;
  expanded: boolean;
  onToggle: () => void;
  collapsed: boolean;
  /** Where the row sits in a superset; `none` for a plain row. */
  place: SupersetPlace;
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
    // A superset's rest is held once, on its last member.
    place === "first" || place === "middle" ? "group" : "own",
  );
  const grouped = place !== "none";
  const thumbnail = (size: number) =>
    info ? (
      <ExerciseThumbnail thumbnailKey={info.thumbnailKey} muscle={info.primaryMuscle} size={size} />
    ) : (
      <View className="rounded-lg bg-default" style={{ width: size, height: size }} />
    );

  if (collapsed) {
    return (
      <View
        className={`h-14 flex-row items-center gap-3 border-b border-border bg-surface pr-4 ${grouped ? "pl-6" : "pl-4"}`}
      >
        <SupersetBracket place={place} />
        {thumbnail(32)}
        <Text numberOfLines={1} className="flex-1 font-medium text-body text-foreground">
          {name}
        </Text>
        <DotsSixVertical size={20} color={subtle} weight="bold" />
      </View>
    );
  }
  return (
    <View>
      <View className="min-h-[72px] flex-row items-center border-b border-border bg-background">
        <SupersetBracket place={place} />
        <View accessible accessibilityLabel={t("training__drag_hint")} className="pl-2">
          <DotsSixVertical size={18} color={subtle} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${grouped ? `${t("training__superset_label")}, ` : ""}${name}, ${summary}${entry.note ? `, ${entry.note}` : ""}`}
          accessibilityHint={t("training__row_open_hint")}
          onPress={onToggle}
          className={`min-h-[72px] flex-1 flex-row items-center gap-3 py-2 ${grouped ? "pl-6" : "pl-4"} active:bg-default`}
        >
          {thumbnail(48)}
          <View className="flex-1 gap-0.5">
            {place === "first" ? (
              <Text className="font-semibold text-overline uppercase text-identity">
                {t("training__superset")}
              </Text>
            ) : null}
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
      {expanded ? (
        <View className="gap-3 border-b border-border px-4 py-3">
          <InlineTargets entry={entry} grouped={place === "first" || place === "middle"} />
        </View>
      ) : null}
    </View>
  );
});
