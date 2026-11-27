import type { RunSlot } from "@workspace/shared";
import { Play } from "phosphor-react-native";
import { useState } from "react";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { openSessionOf } from "@/session";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { Hint } from "@/platform/ui/hint";
import { useHint } from "@/platform/ui/use-hint";
import { PhaseChip } from "@/training/phases/phase-chip";
import { ProgramTile } from "@/training/programs/program-row";
import type { useActiveProgram } from "@/training/programs/use-active-program";
import { slotTitle } from "@/training/rotation/rotation-row";
import { WorkoutTile } from "@/training/shared/workout-tile";

import { CycleStrip } from "./cycle-strip";
import { useSlotDay } from "./use-slot-day";
import { WeekSheet } from "./week-sheet";

const COVER = 64;
const NEXT_TILE = 44;

/**
 * The active program at the top of Train: its cover and name, the week chip ("Week 3 of 12",
 * "Week 5 · Deload" with phases; it opens deload, pause and planning), the day strip (tap a day to
 * start it or skip it this time) and one Start for the next workout. Tapping the heading opens the
 * Program.
 */
export function RunHero({
  state,
  onOpen,
  onPlan,
  onStart,
  onResume,
  openSessions,
  startSecondary,
}: {
  state: ReturnType<typeof useActiveProgram>;
  onOpen: (programId: string) => void;
  /** Open Plan your weeks for the Program. */
  onPlan: (programId: string) => void;
  onStart: (workoutId: string, day: RunSlot) => void;
  /** Open the Session in progress, when it is the next workout's. */
  onResume: (sessionId: string) => void;
  /** The Sessions in progress, newest first. */
  openSessions: Parameters<typeof openSessionOf>[0];
  /** A Session is in progress: Start is quiet so Resume stays the one primary action. */
  startSecondary: boolean;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const onAction = useThemeColor("accent-foreground");
  const { program, run, progress, week, totalWeeks, phase, paused } = state;
  const [weekOpen, setWeekOpen] = useState(false);
  const hint = useHint("train-strip");
  const { dismiss: dismissHint } = hint;
  const day = useSlotDay({
    runId: run?.id ?? null,
    progress,
    onStart,
    onSkip: state.skip,
    onUnskip: state.unskip,
    openSessionFor: (workoutId) => openSessionOf(openSessions, workoutId),
    onResume,
  });
  if (!program || !run) return null;
  const next = program.slots.find((slot) => slot.id === progress.next?.id);
  const nextTitle = next?.workoutId ? slotTitle(next, t) : null;
  // The next workout is already open: offer Resume, not a second Start.
  const open = openSessionOf(openSessions, next?.workoutId ?? null);
  return (
    <View className="gap-4 rounded-xl bg-surface p-3.5">
      <View className="flex-row items-center gap-3">
        <ProgramTile title={program.title} size={COVER} coverMediaId={program.coverMediaId} />
        <View className="min-w-0 flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("training__program_open_hint")}
            onPress={() => onOpen(program.id)}
            className="min-h-11 justify-center gap-0.5 rounded-lg active:opacity-70"
          >
            <Text className="text-caption font-medium text-muted">
              {t(paused ? "run__paused" : "run__active")}
            </Text>
            <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
              {program.title}
            </Text>
          </Pressable>
          <PhaseChip
            phase={program.phasePlan !== null || phase?.phase === "deload" ? phase : null}
            week={week}
            totalWeeks={totalWeeks}
            accessibilityHint={t("run__week_hint")}
            onPress={() => setWeekOpen(true)}
          />
        </View>
      </View>
      {!paused ? (
        <CycleStrip
          slots={program.slots}
          progress={progress}
          onSelect={(slot) => {
            dismissHint();
            day.open(slot);
          }}
        />
      ) : null}
      {!paused && hint.visible ? (
        <Hint text={t("hint__train_strip")} onDismiss={hint.dismiss} />
      ) : null}
      {next?.workoutId && nextTitle ? (
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            {next.workout ? (
              <WorkoutTile
                title={nextTitle}
                size={NEXT_TILE}
                coverMediaId={next.workout.coverMediaId}
                exercises={next.workout.exercises}
              />
            ) : null}
            <View className="min-w-0 flex-1">
              <Text className="font-normal text-caption text-muted">{t("run__up_next")}</Text>
              <Text numberOfLines={1} className="font-medium text-body text-foreground">
                {nextTitle}
              </Text>
              {paused ? (
                <Text className="text-caption text-muted">{t("run__start_resumes")}</Text>
              ) : null}
            </View>
          </View>
          <Button
            size="lg"
            variant={startSecondary && !open ? "secondary" : "primary"}
            className="h-14 w-full"
            onPress={() => {
              if (open) onResume(open.id);
              else if (next.workoutId)
                onStart(next.workoutId, { runId: run.id, slotId: next.id, cycle: progress.cycle });
            }}
          >
            <Play size={20} color={startSecondary && !open ? subtle : onAction} />
            <Button.Label>
              {open
                ? t("session__resume_named", { title: nextTitle })
                : t("training__start_workout_named", { title: nextTitle })}
            </Button.Label>
          </Button>
        </View>
      ) : null}
      {day.sheet}
      <WeekSheet state={state} isOpen={weekOpen} onOpenChange={setWeekOpen} onPlan={onPlan} />
    </View>
  );
}
