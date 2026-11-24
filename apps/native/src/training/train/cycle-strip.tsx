import { Check, Minus } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import type { ProgramSlotDetail } from "@workspace/sync";
import { slotTitle } from "@/training/rotation/rotation-row";
import { stripState } from "./strip-state";

const STATE_KEYS = {
  done: "run__trained",
  skipped: "run__skipped",
  next: "run__up_next",
  todo: "run__untrained",
  rest: "run__rest_day_state",
} as const;

/**
 * One dot per Slot of the Rotation for the current Cycle: done (the accent), skipped (a dash),
 * next (ringed), still to do, and Rest (a small quiet dot). Tapping a Workout dot calls
 * `onSelect`; Rest dots do nothing.
 */
export const CycleStrip = memo(function CycleStrip({
  slots,
  progress,
  onSelect,
}: {
  slots: readonly ProgramSlotDetail[];
  progress: {
    trained: ReadonlySet<string>;
    skipped: ReadonlySet<string>;
    next: { id: string } | null;
  };
  onSelect: (slot: ProgramSlotDetail) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const onAction = useThemeColor("accent-foreground");
  return (
    <View className="flex-row flex-wrap items-center">
      {slots.map((slot, index) => {
        const state = stripState(slot, progress);
        const title = state === "rest" ? t("training__rest_day") : slotTitle(slot, t);
        const label = t("training__chip_state", {
          title: `${index + 1}. ${title}`,
          state: t(STATE_KEYS[state]),
        });
        const dot =
          state === "rest" ? (
            <View className="h-2 w-2 rounded-full bg-default" />
          ) : state === "done" ? (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-accent">
              <Check size={12} weight="bold" color={onAction} />
            </View>
          ) : state === "skipped" ? (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-default">
              <Minus size={12} weight="bold" color={subtle} />
            </View>
          ) : state === "next" ? (
            <View className="h-5 w-5 rounded-full border-2 border-foreground bg-default" />
          ) : (
            <View className="h-5 w-5 rounded-full bg-default" />
          );
        if (state === "rest") {
          return (
            <View
              key={slot.id}
              accessible
              accessibilityLabel={label}
              className="h-11 w-8 items-center justify-center"
            >
              {dot}
            </View>
          );
        }
        return (
          <Pressable
            key={slot.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={t("run__strip_hint")}
            onPress={() => onSelect(slot)}
            className="h-11 w-9 items-center justify-center active:opacity-70"
          >
            {dot}
          </Pressable>
        );
      })}
    </View>
  );
});
