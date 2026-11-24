import { useThemeColor } from "heroui-native";
import { Check, Moon, Play } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { ProgramTile } from "@/training/programs/program-row";
import type { useActiveProgram } from "@/training/programs/use-active-program";
import { slotTitle } from "@/training/rotation/rotation-row";

/**
 * Train's top card: the active Program, its Rotation as chips (trained ones checked, the next one
 * outlined in ink) and one Start for the next Workout. Tapping the heading opens the Program.
 */
export function ProgramCard({
  state,
  onOpen,
  onStart,
  startSecondary,
}: {
  state: ReturnType<typeof useActiveProgram>;
  onOpen: (programId: string) => void;
  onStart: (workoutId: string) => void;
  startSecondary: boolean;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const onAction = useThemeColor("accent-foreground");
  const { program, run, progress, week } = state;
  if (!program || !run) return null;
  const next = program.slots.find((slot) => slot.id === progress.next?.id);
  const position = next ? program.slots.findIndex((slot) => slot.id === next.id) + 1 : 0;
  const weekText = program.plannedWeeks
    ? t("run__week_of", { week, total: program.plannedWeeks })
    : t("run__week", { week });
  const progressText =
    position === 0
      ? weekText
      : program.plannedWeeks
        ? t("run__progress_of", { week, total: program.plannedWeeks, workout: position })
        : t("run__progress", { week, workout: position });
  const nextTitle = next?.workoutId ? slotTitle(next, t) : null;
  return (
    <View className="gap-4 rounded-xl bg-surface p-3.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${program.title}, ${progressText}`}
        onPress={() => onOpen(program.id)}
        className="flex-row items-center gap-3 rounded-xl active:opacity-70"
      >
        <ProgramTile title={program.title} size={44} coverMediaId={program.coverMediaId} />
        <View className="flex-1">
          <Text className="text-caption font-medium text-muted">{t("run__active")}</Text>
          <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
            {program.title}
          </Text>
          <Text numberOfLines={1} className="font-normal text-caption tabular-nums text-muted">
            {progressText}
          </Text>
        </View>
      </Pressable>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel={t("run__cycle", { cycle: progress.cycle })}
      >
        {program.slots.map((slot) => {
          const rest = slot.workoutId === null;
          const trained = progress.trained.has(slot.id);
          const isNext = progress.next?.id === slot.id;
          const title = rest ? t("training__rest_day") : slotTitle(slot, t);
          const outline = isNext ? "border-foreground" : "border-transparent";
          const ink = (trained || rest) && !isNext ? "text-muted" : "text-foreground";
          return (
            <View
              key={slot.id}
              accessible
              accessibilityLabel={t("training__chip_state", {
                title,
                state: t(trained ? "run__trained" : isNext ? "run__up_next" : "run__untrained"),
              })}
              className={`h-9 flex-row items-center gap-1 rounded-full border bg-default px-3 ${outline}`}
            >
              {rest ? <Moon size={20} weight="regular" color={subtle} /> : null}
              {trained ? <Check size={20} weight="regular" color={subtle} /> : null}
              {rest ? null : (
                <Text numberOfLines={1} className={`max-w-32 text-label font-medium ${ink}`}>
                  {title}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {next?.workoutId && nextTitle ? (
        <Button
          size="lg"
          variant={startSecondary ? "secondary" : "primary"}
          className="h-14 w-full"
          onPress={() => onStart(next.workoutId ?? "")}
        >
          <Play size={20} color={startSecondary ? subtle : onAction} />
          <Button.Label>{t("training__start_workout_named", { title: nextTitle })}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
