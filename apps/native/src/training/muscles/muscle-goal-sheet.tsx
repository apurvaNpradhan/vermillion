import {
  CUSTOM_GOAL_MAX,
  GOAL_LEVELS,
  GOAL_RANGES,
  MUSCLE_GROUP_KEYS,
  goalRange,
  type GoalLevel,
  type MuscleContribution,
  type MuscleGoal,
  type TargetMuscle,
  type WeekRange,
} from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { BarChart } from "@/platform/ui/charts/chart";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";

import { formatSets } from "./muscle-bars";
import { customGoal } from "./custom-goal";

/** How many contributing exercises the sheet lists; the sheet cannot scroll. */
const LISTED = 4;

const LEVEL_KEYS = {
  maintain: "muscles__level_maintain",
  grow: "muscles__level_grow",
  focus: "muscles__level_focus",
  custom: "muscles__level_custom",
} as const satisfies Record<GoalLevel, string>;

/**
 * One muscle: its last eight weeks as bars (the goal's minimum dashed across them), its goal level
 * (Maintain, Grow, Focus or Custom with two number fields) and the exercises that gave it sets
 * this week. Presets save at once; Custom saves with its button.
 */
export function MuscleGoalSheet({
  muscle,
  goal,
  planned,
  weeks,
  series,
  contributions,
  onChange,
  onClose,
}: {
  muscle: TargetMuscle;
  goal: MuscleGoal | undefined;
  planned: number | null;
  /** The eight weeks of the chart, oldest first. */
  weeks: readonly WeekRange[];
  /** Weighted sets in each of those weeks. */
  series: readonly number[];
  contributions: readonly MuscleContribution[];
  onChange: (goal: MuscleGoal | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const sheet = useSheetPresent();
  const [picked, setPicked] = useState<GoalLevel | null>(goal?.level ?? null);
  // The target the muscle's row uses: its goal, else the program-planned sets, else none.
  const resolved = goalRange(goal, planned);
  const range = resolved ?? GOAL_RANGES.maintain;
  const [min, setMin] = useState(String(range.min));
  const [max, setMax] = useState(String(range.max));
  const parsed = customGoal(min, max);
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const points = weeks.map((week, index) => ({
    id: String(week.start),
    x: week.start,
    y: series[index] ?? 0,
    label: t("muscles__week_of", { date: date.format(week.start) }),
  }));
  const preset = picked === null || picked === "custom" ? null : GOAL_RANGES[picked];
  return (
    <BottomSheet
      isOpen={sheet.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          {sheet.probe}
          <BottomSheet.Title className="font-semibold text-title-lg">
            {t("muscles__goal_title", { muscle: t(MUSCLE_GROUP_KEYS[muscle]) })}
          </BottomSheet.Title>
          <BarChart
            showRanges={false}
            goal={resolved?.min ?? null}
            points={points}
            label={t("muscles__chart_label", { muscle: t(MUSCLE_GROUP_KEYS[muscle]) })}
            formatValue={(value) =>
              t("muscles__row_volume", { sets: formatSets(value, i18n.language) })
            }
          />
          {planned === null ? null : (
            <SegmentedControl
              accessibilityLabel={t("muscles__goal_label")}
              value={picked}
              options={GOAL_LEVELS.map((value) => ({ value, label: t(LEVEL_KEYS[value]) }))}
              onChange={(next) => {
                setPicked(next);
                if (next !== "custom") onChange({ level: next });
              }}
            />
          )}
          {planned !== null && picked === null && planned > 0 ? (
            <Text className="font-normal text-caption tabular-nums text-muted">
              {t("muscles__program_count", { sets: formatSets(planned, i18n.language) })}
            </Text>
          ) : null}
          {planned !== null && picked !== null ? (
            <Button
              variant="tertiary"
              onPress={() => {
                setPicked(null);
                onChange(null);
              }}
            >
              <Button.Label>{t("muscles__use_program_goal")}</Button.Label>
            </Button>
          ) : null}
          {planned !== null && preset ? (
            <Text className="font-normal text-caption tabular-nums text-muted">
              {t("muscles__level_range", preset)}
            </Text>
          ) : planned !== null && picked === "custom" ? (
            <View className="gap-3">
              <View className="flex-row gap-3">
                <Field
                  className="flex-1"
                  label={t("muscles__custom_min")}
                  value={min}
                  onChangeText={setMin}
                  keyboardType="number-pad"
                  maxLength={String(CUSTOM_GOAL_MAX).length}
                />
                <Field
                  className="flex-1"
                  label={t("muscles__custom_max")}
                  value={max}
                  onChangeText={setMax}
                  keyboardType="number-pad"
                  maxLength={String(CUSTOM_GOAL_MAX).length}
                  error={parsed === null ? t("muscles__custom_invalid") : undefined}
                />
              </View>
              <Button
                isDisabled={parsed === null}
                onPress={() => {
                  if (parsed) onChange(parsed);
                }}
              >
                <Button.Label>{t("common__save")}</Button.Label>
              </Button>
            </View>
          ) : null}
          <View className="gap-2 rounded-2xl bg-surface p-4">
            <Text className="text-caption font-medium text-muted">{t("muscles__sets_from")}</Text>
            {contributions.length === 0 ? (
              <Text className="font-normal text-body text-muted">
                {t("muscles__sets_from_none")}
              </Text>
            ) : (
              contributions.slice(0, LISTED).map((item) => (
                <View
                  key={item.exerciseId}
                  className="flex-row items-baseline justify-between gap-3"
                >
                  <Text numberOfLines={1} className="font-normal flex-1 text-body text-foreground">
                    {item.title}
                  </Text>
                  <Text className="font-normal text-body tabular-nums text-muted">
                    {formatSets(item.sets, i18n.language)}
                  </Text>
                </View>
              ))
            )}
            {contributions.length > LISTED ? (
              <Text className="font-normal text-caption text-muted">
                {t("muscles__sets_from_more", { count: contributions.length - LISTED })}
              </Text>
            ) : null}
          </View>
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
