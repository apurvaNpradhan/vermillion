import { ArrowUUpLeft, Play, SkipForward } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";

import type { RunSlot } from "@workspace/shared";
import type { ProgramSlotDetail } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { slotTitle } from "@/training/rotation/rotation-row";

import { stripState, type StripState } from "./strip-state";

type Progress = {
  trained: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  next: { id: string } | null;
};

/** Captures the day and Cycle the user tapped while the action sheet is open. */
export function useSlotDay({
  runId,
  progress,
  onStart,
  onSkip,
  onUnskip,
}: {
  runId: string | null;
  progress: Progress & { cycle: number; latestCountedCycle: number };
  onStart: (workoutId: string, day: RunSlot) => void;
  onSkip: (day: RunSlot, title: string) => void;
  onUnskip: (day: RunSlot) => Promise<boolean> | boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{
    slot: ProgramSlotDetail;
    day: RunSlot;
    state: StripState;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(
    (slot: ProgramSlotDetail) => {
      if (runId === null) return;
      setSelected({
        slot,
        day: { runId, cycle: progress.cycle, slotId: slot.id },
        state: stripState(slot, progress),
      });
      setIsOpen(true);
    },
    [runId, progress],
  );

  const title = selected ? slotTitle(selected.slot, t) : "";
  const actions = useMemo<SwipeAction[]>(() => {
    if (
      !selected ||
      !selected.slot.workoutId ||
      selected.day.runId !== runId ||
      selected.day.cycle < progress.latestCountedCycle
    )
      return [];
    const { slot, day } = selected;
    const workoutId = selected.slot.workoutId;
    const current = day.cycle === progress.cycle;
    const state = current ? stripState(slot, progress) : selected.state;
    if (!current && state !== "skipped") return [];
    const start: SwipeAction = {
      key: "start",
      label: t("training__start_workout_named", { title }),
      icon: Play,
      onPress: () => onStart(workoutId, day),
    };
    if (state === "done") return [start];
    return [
      start,
      state === "skipped"
        ? {
            key: "undo-skip",
            label: t("run__undo_skip"),
            icon: ArrowUUpLeft,
            onPress: () => void onUnskip(day),
          }
        : {
            key: "skip",
            label: t("run__skip_cycle"),
            icon: SkipForward,
            onPress: () => onSkip(day, title),
          },
    ];
  }, [selected, progress, runId, title, t, onStart, onSkip, onUnskip]);

  return {
    open,
    sheet: (
      <ActionSheet
        title={title}
        actions={actions}
        isOpen={isOpen && actions.length > 0}
        onOpenChange={setIsOpen}
      />
    ),
  };
}
