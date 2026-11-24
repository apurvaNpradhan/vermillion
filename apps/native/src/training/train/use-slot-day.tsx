import { ArrowUUpLeft, Play, SkipForward } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";

import type { ProgramSlotDetail } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { slotTitle } from "@/training/rotation/rotation-row";

import { stripState } from "./strip-state";

type Progress = {
  trained: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  next: { id: string } | null;
};

/**
 * The sheet a tap on a cycle-strip dot opens: start that day, or skip it for this Cycle (and take
 * a skip back). Starting a skipped day first takes the skip back, so the Session fills that Slot.
 * `open(slot)` opens it; render `sheet` once.
 */
export function useSlotDay({
  progress,
  onStart,
  onSkip,
  onUnskip,
}: {
  progress: Progress;
  onStart: (workoutId: string) => void;
  onSkip: (slotId: string, title: string) => void;
  onUnskip: (slotId: string) => Promise<boolean> | boolean;
}) {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<ProgramSlotDetail | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback((next: ProgramSlotDetail) => {
    setSlot(next);
    setIsOpen(true);
  }, []);

  const title = slot ? slotTitle(slot, t) : "";
  const state = slot ? stripState(slot, progress) : "todo";
  const actions = useMemo<SwipeAction[]>(() => {
    if (!slot || slot.workoutId === null) return [];
    const workoutId = slot.workoutId;
    const start: SwipeAction = {
      key: "start",
      label: t("training__start_workout_named", { title }),
      icon: Play,
      onPress: () => {
        if (state === "skipped")
          void Promise.resolve(onUnskip(slot.id)).then(() => onStart(workoutId));
        else onStart(workoutId);
      },
    };
    const second: SwipeAction =
      state === "skipped"
        ? {
            key: "undo-skip",
            label: t("run__undo_skip"),
            icon: ArrowUUpLeft,
            onPress: () => void onUnskip(slot.id),
          }
        : {
            key: "skip",
            label: t("run__skip_cycle"),
            icon: SkipForward,
            onPress: () => onSkip(slot.id, title),
          };
    // A day already trained this Cycle can still be started again, but there is nothing to skip.
    return state === "done" ? [start] : [start, second];
  }, [slot, state, title, t, onStart, onSkip, onUnskip]);

  return {
    open,
    sheet: <ActionSheet title={title} actions={actions} isOpen={isOpen} onOpenChange={setIsOpen} />,
  };
}
