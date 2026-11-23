import { isTargetMuscle, type TargetMuscle } from "@workspace/shared";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import {
  BodyMapPair,
  BodyRegionIcon,
  isBodyGroup,
  muscleArtTint,
  type BodyGroup,
} from "@/body-map";
import { useTranslation } from "@/platform/i18n";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { useAppliedVariant, useThemeMode } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { FadeIn } from "@/platform/ui/fade-in";
import { ScrollPage } from "@/platform/ui/page";
import { useActiveProgram } from "@/training/programs/use-active-program";

import { bodyIntensity } from "./muscle-bars";
import { MuscleGoalSheet } from "./muscle-goal-sheet";
import { groupParts } from "./muscle-parts";
import { MUSCLE_REGIONS, regionRows } from "./muscle-regions";
import { MuscleRow } from "./muscle-row";
import { useMuscleVolume } from "./use-muscle-volume";

const MAP_LEVELS = ["untrained", "low", "mid", "high"] as const;
const SAMPLE_INTENSITY = {
  chest: 0.9,
  biceps: 0.2,
  lats: 0.9,
  quadriceps: 0.6,
  glutes: 0.6,
  hamstrings: 0.2,
} satisfies Partial<Record<BodyGroup, number>>;

/**
 * Muscles: how many muscles are on target, this week's body map (a heat map in the accent), then
 * every muscle under its movement (Push, Pull, Legs, Core) as this week's sets against the weekly
 * target, with a marker for the four weeks before. A row opens that muscle's eight weeks as bars,
 * with its goal. Reached from History.
 */
export function MusclesScreen() {
  const { t } = useTranslation();
  const program = useActiveProgram();
  const volume = useMuscleVolume(program.program);
  const [chosen, setChosen] = useState<TargetMuscle | null>(null);
  const [showSample, setShowSample] = useState(false);
  const sampleVisible = __DEV__ && showSample;
  const colors = nativeColors[useAppliedVariant()];
  const targets = volume.rows.filter((row) => row.status !== null);
  const peak = Math.max(1, ...volume.loads.map((load) => load.sets));
  const intensity: Partial<Record<BodyGroup, number>> = {};
  for (const [muscle, value] of bodyIntensity(volume.loads, volume.rows))
    if (isBodyGroup(muscle)) intensity[muscle] = value;
  const dark = useThemeMode() === "dark";
  const artTint = useMemo(() => muscleArtTint(colors.chart, dark), [colors.chart, dark]);
  const regions = useMemo(() => regionRows(volume.rows), [volume.rows]);
  return (
    <ScrollPage title={t("muscles__title")} back backFallback="/history">
      {volume.failed ? (
        <Button variant="secondary" onPress={volume.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : volume.loading || !program.ready ? null : (
        <FadeIn className="gap-6">
          <View className="gap-4 rounded-2xl bg-surface p-4">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <View className="gap-1">
                <Text
                  accessibilityRole="header"
                  className="font-semibold text-title-md text-foreground"
                >
                  {t("muscles__map_title")}
                </Text>
                {targets.length > 0 ? (
                  <Text className="font-normal text-caption tabular-nums text-muted">
                    {t("muscles__tile_value", { done: volume.onTarget, total: targets.length })}
                  </Text>
                ) : null}
              </View>
              {__DEV__ ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => setShowSample((value) => !value)}
                >
                  <Button.Label>
                    {t(sampleVisible ? "muscles__map_show_actual" : "muscles__map_show_sample")}
                  </Button.Label>
                </Button>
              ) : null}
            </View>
            {sampleVisible ? (
              <Text className="font-normal text-caption text-muted">
                {t("muscles__map_sample_caption")}
              </Text>
            ) : null}
            <View className="w-full max-w-[340px] gap-3 self-center rounded-xl bg-background p-3">
              <BodyMapPair
                intensity={sampleVisible ? SAMPLE_INTENSITY : intensity}
                artTint={artTint}
              />
              <View className="flex-row gap-4" accessible={false} aria-hidden>
                <Text className="font-normal flex-1 text-center text-caption text-muted">
                  {t("bodymap__view_front")}
                </Text>
                <Text className="font-normal flex-1 text-center text-caption text-muted">
                  {t("bodymap__view_back")}
                </Text>
              </View>
            </View>
            <View className="flex-row flex-wrap justify-center gap-3">
              {MAP_LEVELS.map((level) => (
                <View key={level} className="flex-row items-center gap-1.5">
                  <View
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: artTint.legend[level] }}
                  />
                  <Text className="font-normal text-caption text-muted">
                    {t(`muscles__map_${level}`)}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="font-normal text-center text-caption text-muted">
              {t(targets.length === 0 ? "muscles__map_volume_caption" : "muscles__map_caption")}
            </Text>
          </View>
          {volume.loads.length === 0 ? (
            <Text className="font-normal text-center text-body text-muted">
              {t("muscles__empty")}
            </Text>
          ) : null}
          {regions.map((region) => {
            const definition = MUSCLE_REGIONS.find((candidate) => candidate.key === region.key);
            return (
              <View key={region.key} className="gap-1 rounded-2xl bg-surface py-2">
                <View className="flex-row items-center gap-3 px-3 py-2">
                  {definition ? (
                    <BodyRegionIcon groups={definition.icon} view={definition.view} size={32} />
                  ) : null}
                  <Text
                    accessibilityRole="header"
                    className="font-semibold text-title-md text-foreground"
                  >
                    {t(`muscles__region_${region.key}`)}
                  </Text>
                </View>
                {region.rows.map((row) => (
                  <MuscleRow
                    key={row.muscle}
                    row={row}
                    peak={peak}
                    average={volume.average(row.muscle)}
                    parts={groupParts(volume.detailLoads, row.muscle)}
                    onPress={() => setChosen(row.muscle)}
                  />
                ))}
              </View>
            );
          })}
        </FadeIn>
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
          weeks={volume.trend.weeks}
          series={volume.trend.sets.get(chosen) ?? []}
          contributions={volume.contributions(chosen)}
          onChange={(goal) => volume.setGoal(chosen, goal)}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </ScrollPage>
  );
}
