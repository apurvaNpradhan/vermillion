import { Pressable, ScrollView, Text, View } from "react-native";
import { PHASE_WEEK_MAX } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";

import type { StripBlock } from "./phase-strip-math";

/** Height of the tallest block (a Test week). */
const BLOCK_MAX = 56;
const BLOCK_WIDTH = 28;

/**
 * The Program's weeks as a small block chart: each week a flat block as tall as its phase is hard
 * (Deload lowest, Test tallest). Weeks already trained are ink, weeks to come a quiet fill, and
 * the current week carries the accent dot. Tapping a week sets its phase; an inserted Deload week
 * is set by "Deload this week" and does not open.
 */
export function PhaseStrip({
  blocks,
  onSelect,
}: {
  blocks: readonly StripBlock[];
  onSelect: (block: StripBlock) => void;
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-end gap-1.5 px-4"
    >
      {blocks.map((block) => {
        const disabled =
          block.trained ||
          block.inserted ||
          block.overrideLimit ||
          block.programWeek > PHASE_WEEK_MAX;
        return (
          <Pressable
            key={block.week}
            accessibilityRole="button"
            accessibilityLabel={t(
              block.state === "current" ? "phase__week_label_current" : "phase__week_label",
              { week: block.week, phase: text.name(block.phase) },
            )}
            accessibilityHint={
              block.trained
                ? t("phase__trained_hint")
                : block.inserted
                  ? t("phase__inserted_hint")
                  : block.overrideLimit
                    ? t("phase__override_limit_hint")
                    : disabled
                      ? undefined
                      : t("phase__week_hint")
            }
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(block)}
            className="min-w-11 items-center gap-1.5 active:opacity-70"
          >
            <View className="h-1.5 w-1.5">
              {block.state === "current" ? (
                <View className="h-1.5 w-1.5 rounded-full bg-accent" />
              ) : null}
            </View>
            <View className="justify-end" style={{ height: BLOCK_MAX, width: BLOCK_WIDTH }}>
              <View
                style={{ height: Math.round(BLOCK_MAX * block.height) }}
                className={`w-full rounded-sm ${block.state === "future" ? "bg-default" : "bg-foreground"}`}
              />
            </View>
            <Text className="font-normal text-caption tabular-nums text-muted">{block.week}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
