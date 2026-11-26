import { planOrBuild, weeksSummary, type PhasePlan } from "@workspace/shared";
import type { readRuns } from "@workspace/sync";
import { CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { useSubtleColor } from "@/platform/theme";

import { stripBlocks } from "./phase-strip-math";

const BLOCK_MAX = 24;

/**
 * The Weeks row on the Program page: a small block strip of its weeks (ember marks the current
 * one) over a one-line summary, "12 weeks · Build ×3, Deload". It opens Plan your weeks.
 */
export function WeeksRow({
  plan,
  plannedWeeks,
  run,
  trainedAt,
  onPress,
}: {
  plan: PhasePlan | null;
  plannedWeeks: number | null;
  /** The active Run when the Program is the active one; null otherwise. */
  run: Awaited<ReturnType<typeof readRuns>>[number] | null;
  trainedAt?: readonly string[];
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const timeZone = useDeviceTimeZone();
  const subtle = useSubtleColor();
  const blocks = stripBlocks({
    plan: planOrBuild(plan),
    current: run ? { run, now: new Date(), timeZone, trainedAt } : undefined,
    plannedWeeks,
  });
  const summary = text.summary(weeksSummary({ plan, plannedWeeks }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("phase__weeks")}, ${summary}`}
      accessibilityHint={t("phase__weeks_hint")}
      onPress={onPress}
      className="min-h-16 gap-3 rounded-2xl bg-surface px-4 py-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-label font-medium text-foreground">{t("phase__weeks")}</Text>
          <Text className="font-normal text-caption text-muted">{summary}</Text>
        </View>
        <CaretRight size={16} color={subtle} />
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        className="flex-row items-end gap-0.5"
        style={{ height: BLOCK_MAX }}
      >
        {blocks.map((block) => (
          <View
            key={block.week}
            style={{ height: Math.round(BLOCK_MAX * block.height) }}
            className={`max-w-3 flex-1 rounded-sm ${
              block.state === "current"
                ? "bg-accent"
                : block.state === "future"
                  ? "bg-default"
                  : "bg-foreground"
            }`}
          />
        ))}
      </View>
    </Pressable>
  );
}
