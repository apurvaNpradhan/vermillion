import type { RunSlot } from "@workspace/shared";
import { Play } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { PhaseChip } from "@/training/phases/phase-chip";
import { useInsertDeload } from "@/training/phases/use-insert-deload";
import { ProgramTile } from "@/training/programs/program-row";
import type { useActiveProgram } from "@/training/programs/use-active-program";
import { slotTitle } from "@/training/rotation/rotation-row";
import { WorkoutTile } from "@/training/shared/workout-tile";

import { CycleStrip } from "./cycle-strip";
import { useSlotDay } from "./use-slot-day";

const COVER = 64;
const NEXT_TILE = 44;

/**
 * The active Run at the top of Train: the Program's cover and name, "Week 3 of 12" (a chip, "Week
 * 5 · Deload", once the Run has phases), the cycle strip (tap a day to start it or skip it for
 * this Cycle), "Insert deload" and one Start for the next Workout. Tapping the heading opens the
 * Program.
 */
export function RunHero({
  state,
  onOpen,
  onStart,
  startSecondary,
}: {
  state: ReturnType<typeof useActiveProgram>;
  onOpen: (programId: string) => void;
  onStart: (workoutId: string, day: RunSlot) => void;
  /** A Session is in progress: Start is quiet so Resume stays the one primary action. */
  startSecondary: boolean;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const onAction = useThemeColor("accent-foreground");
  const { program, run, progress, week, totalWeeks, phase, paused } = state;
  const insert = useInsertDeload(run);
  const day = useSlotDay({
    runId: run?.id ?? null,
    progress,
    onStart,
    onSkip: state.skip,
    onUnskip: state.unskip,
  });
  if (!program || !run) return null;
  const next = program.slots.find((slot) => slot.id === progress.next?.id);
  const weekText = totalWeeks
    ? t("run__week_of", { week, total: totalWeeks })
    : t("run__week", { week });
  const nextTitle = next?.workoutId ? slotTitle(next, t) : null;
  return (
    <View className="gap-4 rounded-xl bg-surface p-3.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${program.title}, ${weekText}`}
        onPress={() => onOpen(program.id)}
        className="flex-row items-center gap-3 rounded-xl active:opacity-70"
      >
        <ProgramTile title={program.title} size={COVER} coverMediaId={program.coverMediaId} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-caption font-medium text-muted">
            {t(paused ? "run__paused" : "run__active")}
          </Text>
          <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
            {program.title}
          </Text>
          {phase ? (
            <PhaseChip phase={phase} totalWeeks={totalWeeks} />
          ) : (
            <Text numberOfLines={1} className="font-normal text-caption tabular-nums text-muted">
              {weekText}
            </Text>
          )}
        </View>
      </Pressable>
      {!paused ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-normal text-caption tabular-nums text-muted">
              {t("run__cycle", { cycle: progress.cycle })}
            </Text>
            {phase?.phase === "deload" ? null : (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={insert.ask}
                className="min-h-8 justify-center active:opacity-60"
              >
                <Text className="font-normal text-caption text-muted">
                  {t("phase__insert_now")}
                </Text>
              </Pressable>
            )}
          </View>
          <CycleStrip slots={program.slots} progress={progress} onSelect={day.open} />
        </View>
      ) : null}
      <Button size="sm" variant="tertiary" onPress={() => void state.changePause(!paused)}>
        <Button.Label>{t(paused ? "run__resume_run" : "run__pause_run")}</Button.Label>
      </Button>
      {!paused && next?.workoutId && nextTitle ? (
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
            </View>
          </View>
          <Button
            size="lg"
            variant={startSecondary ? "secondary" : "primary"}
            className="h-14 w-full"
            onPress={() => {
              if (next.workoutId)
                onStart(next.workoutId, { runId: run.id, slotId: next.id, cycle: progress.cycle });
            }}
          >
            <Play size={20} color={startSecondary ? subtle : onAction} />
            <Button.Label>{t("training__start_workout_named", { title: nextTitle })}</Button.Label>
          </Button>
        </View>
      ) : null}
      {day.sheet}
      {insert.dialog}
    </View>
  );
}
