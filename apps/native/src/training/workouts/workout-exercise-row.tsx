import { resolveExerciseUnit } from "@workspace/shared";
import { ReorderBlock, ReorderTrigger } from "@/training/reorder/reorder-block";
import type { SupersetPlace } from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { DotsThreeVertical } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail, PinnedNote } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { InlineTargets } from "@/training/sets/inline-targets";
import { summariseSets } from "./summarise-sets";
import { useSummaryLabels } from "./use-summary-labels";
import { useTrainingPreferences } from "@/training/shared/use-training-preferences";

const FALLBACK_TYPE = "weight_reps";

/**
 * The left bracket of a superset in muted ink: one bar that runs through the run's rows,
 * rounded where the run starts and ends.
 */
export function SupersetBracket({ place }: { place: SupersetPlace }) {
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
      className={`absolute left-2.5 w-[3px] bg-muted ${edges}`}
    />
  );
}

/**
 * One exercise of a Workout as a summary row: thumbnail, name, `3 × 8–10 · RPE 8–9 · 2:00` and
 * the pinned note. Holding the header opens the Reorder view.
 */
export const WorkoutExerciseRow = memo(function WorkoutExerciseRow({
  entry,
  expanded,
  onToggle,
  place,
  onReorder,
  onMenu,
}: {
  entry: WorkoutExerciseDetail;
  expanded: boolean;
  onToggle: () => void;
  /** Where the row sits in a superset; `none` for a plain row. */
  place: SupersetPlace;
  /** Long press on the header: open the Reorder view. */
  onReorder: () => void;
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
    { weightUnit: resolveExerciseUnit(weightUnit, entry.unit), effortScale },
    labels,
    // A superset's rest is held once, on its last member.
    place === "first" || place === "middle" ? "group" : "own",
  );
  const grouped = place !== "none";
  const thumbnail = (size: number) => (
    <ExerciseThumbnail
      title={name}
      imageMediaId={info?.imageMediaId}
      thumbnailKey={info?.thumbnailKey ?? null}
      size={size}
    />
  );

  return (
    <ReorderBlock onReorder={onReorder}>
      <ReorderTrigger className="min-h-[72px] flex-row items-center bg-background">
        <SupersetBracket place={place} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${grouped ? `${t("training__superset_label")}, ` : ""}${name}, ${summary}${entry.note ? `, ${entry.note}` : ""}`}
          accessibilityHint={`${t("training__row_open_hint")}. ${t("training__drag_hint")}`}
          accessibilityActions={[{ name: "reorder", label: t("training__reorder") }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "reorder") onReorder();
          }}
          onPress={onToggle}
          className={`min-h-[72px] flex-1 flex-row items-center gap-3 py-2 ${grouped ? "pl-6" : "pl-4"} active:bg-default`}
        >
          {thumbnail(40)}
          <View className="flex-1 gap-0.5">
            {place === "first" ? (
              <Text className="font-semibold text-overline uppercase text-foreground">
                {t("training__superset")}
              </Text>
            ) : null}
            <Text numberOfLines={1} className="font-medium text-body text-foreground">
              {name}
            </Text>
            <Text
              numberOfLines={2}
              className="font-normal text-caption text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {summary}
            </Text>
            {entry.pinnedNote ? <PinnedNote note={entry.pinnedNote} /> : null}
            {entry.note ? (
              <Text numberOfLines={2} className="font-normal text-caption text-muted">
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
          <DotsThreeVertical size={20} color={subtle} />
        </Pressable>
      </ReorderTrigger>
      {expanded ? (
        <View className="gap-3 bg-surface px-4 py-4">
          <InlineTargets entry={entry} grouped={place === "first" || place === "middle"} />
        </View>
      ) : null}
    </ReorderBlock>
  );
});
