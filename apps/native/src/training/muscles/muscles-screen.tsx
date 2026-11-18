import { isTargetMuscle, type TargetMuscle } from "@workspace/shared";
import { useThemeColor } from "heroui-native";
import { CaretLeft, CaretRight } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";

import { bodyIntensity } from "./muscle-bars";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { MuscleGoalSheet } from "./muscle-goal-sheet";
import { MuscleRow } from "./muscle-row";
import { useMuscleVolume } from "./use-muscle-volume";

/** The furthest back the week switcher goes. */
const MAX_WEEKS_AGO = 12;

/**
 * Muscles: the week's Counted sets per muscle against each muscle's range, below target first,
 * under the body map. A row opens that muscle's goal; the arrows step through earlier weeks.
 */
export function MusclesScreen() {
  const { t, i18n } = useTranslation();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const program = useActiveProgram();
  const volume = useMuscleVolume(weeksAgo, program.program);
  const [chosen, setChosen] = useState<TargetMuscle | null>(null);
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const date = (day: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(day);
  const label =
    weeksAgo === 0
      ? t("muscles__this_week")
      : weeksAgo === 1
        ? t("muscles__last_week")
        : t("muscles__week_range", {
            start: date(volume.week.start),
            end: date(volume.week.end - 86_400_000),
          });
  const peak = Math.max(1, ...volume.loads.map((load) => load.sets));
  const intensity: Partial<Record<BodyGroup, number>> = {};
  for (const [muscle, value] of bodyIntensity(volume.loads, volume.rows))
    if (isBodyGroup(muscle)) intensity[muscle] = value;
  const step = (by: number) => {
    haptic.tick();
    setWeeksAgo((current) => Math.min(MAX_WEEKS_AGO, Math.max(0, current + by)));
  };
  return (
    <ScrollPage title={t("muscles__title")} back backFallback="/">
      <View className="h-11 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("muscles__previous_week")}
          disabled={weeksAgo >= MAX_WEEKS_AGO}
          onPress={() => step(1)}
          className="h-11 w-11 items-center justify-center rounded-full bg-default"
          style={{ opacity: weeksAgo >= MAX_WEEKS_AGO ? 0.4 : 1 }}
        >
          <CaretLeft size={18} color={foreground} />
        </Pressable>
        <Text className="text-body font-medium text-foreground">{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("muscles__next_week")}
          disabled={weeksAgo === 0}
          onPress={() => step(-1)}
          className="h-11 w-11 items-center justify-center rounded-full bg-default"
          style={{ opacity: weeksAgo === 0 ? 0.4 : 1 }}
        >
          <CaretRight size={18} color={weeksAgo === 0 ? muted : foreground} />
        </Pressable>
      </View>
      {volume.failed ? (
        <Button variant="secondary" onPress={volume.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : volume.loading || !program.ready ? (
        <Skeleton label={t("common__loading")} className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          <View className="gap-2 rounded-2xl bg-surface p-4">
            <BodyMapPair intensity={intensity} />
            <Text className="text-center text-caption text-muted">
              {t(volume.planned === null ? "muscles__map_volume_caption" : "muscles__map_caption")}
            </Text>
          </View>
          {volume.loads.length === 0 ? (
            <Text className="text-center text-body text-muted">{t("muscles__empty")}</Text>
          ) : null}
          <View className="gap-1 rounded-2xl bg-surface py-2">
            {volume.rows.map((row) => (
              <MuscleRow
                key={row.muscle}
                row={row}
                peak={peak}
                onPress={() => setChosen(row.muscle)}
              />
            ))}
          </View>
        </>
      )}
      {chosen !== null && isTargetMuscle(chosen) ? (
        <MuscleGoalSheet
          muscle={chosen}
          goal={volume.goals[chosen]}
          planned={
            volume.planned === null
              ? null
              : (volume.planned.find((row) => row.muscle === chosen)?.sets ?? 0)
          }
          contributions={volume.contributions(chosen)}
          onChange={(goal) => volume.setGoal(chosen, goal)}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </ScrollPage>
  );
}
