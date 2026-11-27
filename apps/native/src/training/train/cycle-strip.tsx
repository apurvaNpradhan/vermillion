import { memo } from "react";
import { Pressable, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { DayMark } from "@/platform/ui/day-mark";

import type { ProgramSlotDetail } from "@workspace/sync";
import { slotTitle } from "@/training/rotation/rotation-row";
import { SLOT_STATE_KEYS, slotLabel, stripState } from "./strip-state";

/**
 * One dot per Slot of the Rotation for the current Cycle: done (a filled ink mark), skipped (a
 * hollow mark with a slash), next (the accent dot), still to do (hollow) and Rest (a short hairline). Tapping a Workout dot calls
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
  return (
    <View className="flex-row flex-wrap items-center">
      {slots.map((slot, index) => {
        const state = stripState(slot, progress);
        const title = state === "rest" ? t("training__rest_day") : slotTitle(slot, t);
        const label = slotLabel(t, { day: index + 1, state, title }, t(SLOT_STATE_KEYS[state]));
        if (state === "rest") {
          return (
            <View
              key={slot.id}
              accessible
              accessibilityLabel={label}
              className="h-11 w-11 items-center justify-center"
            >
              <DayMark state={state} />
            </View>
          );
        }
        return (
          <Pressable
            key={slot.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={t(
              state === "done"
                ? "run__strip_start_hint"
                : state === "skipped"
                  ? "run__strip_undo_hint"
                  : "run__strip_skip_hint",
            )}
            onPress={() => onSelect(slot)}
            className="h-11 w-11 items-center justify-center active:opacity-70"
          >
            <DayMark state={state} />
          </Pressable>
        );
      })}
    </View>
  );
});
