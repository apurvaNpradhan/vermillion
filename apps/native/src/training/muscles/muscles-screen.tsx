import { isTargetMuscle, type TargetMuscle } from "@workspace/shared";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { BodyMapPair, isBodyGroup, muscleArtTint, type BodyGroup } from "@/body-map";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { useAppliedVariant, useThemeMode } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { FadeIn } from "@/platform/ui/fade-in";
import { ScrollPage } from "@/platform/ui/page";
import { PeriodCard } from "@/platform/ui/period-card";
import { RadarChart } from "@/platform/ui/radar-chart";
import { SegmentedControl, type SegmentedOption } from "@/platform/ui/segmented-control";

import { bodyIntensity } from "./muscle-bars";
import { MuscleGoalSheet } from "./muscle-goal-sheet";
import { MuscleRow } from "./muscle-row";
import { muscleRadarAxes, radarValue } from "./muscle-axes";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useMuscleVolume } from "./use-muscle-volume";

/** The furthest back the period card goes. */
const MAX_WEEKS_AGO = 12;
const DAY_MS = 86_400_000;

type Span = "week" | "four";
const WEEKS: Record<Span, number> = { week: 1, four: 4 };
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
 * Muscles: a period card (Week, or the average a week over the four whole weeks before it) with a
 * radar of weighted muscle volume in six groups against their targets, the body map tinted from
 * quiet to the accent, and every muscle under it, below target first. A row opens that muscle's
 * goal; the arrows and a swipe step back a week at a time. The card and its controls stay
 * mounted while the next period loads, showing the previous one until it lands.
 */
export function MusclesScreen() {
  const { t, i18n } = useTranslation();
  const [span, setSpan] = useState<Span>("week");
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const program = useActiveProgram();
  const volume = useMuscleVolume(weeksAgo, program.program, WEEKS[span]);
  const [chosen, setChosen] = useState<TargetMuscle | null>(null);
  const [showSample, setShowSample] = useState(false);
  const sampleVisible = __DEV__ && showSample;
  const colors = nativeColors[useAppliedVariant()];
  const options: SegmentedOption<Span>[] = [
    { value: "week", label: t("muscles__period_week") },
    { value: "four", label: t("muscles__period_four") },
  ];
  const date = (day: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(day);
  const range = t("muscles__week_range", {
    start: date(volume.week.start),
    end: date(volume.week.end - DAY_MS),
  });
  const title =
    span === "four"
      ? weeksAgo === 0
        ? t("muscles__last_four")
        : range
      : weeksAgo === 0
        ? t("muscles__this_week")
        : weeksAgo === 1
          ? t("muscles__last_week")
          : range;
  const targets = volume.rows.filter((row) => row.status !== null);
  const rounded = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(
    volume.completedSets,
  );
  // With no target the headline is the sets actually done, not the weighted volume the radar draws.
  const headlineText =
    targets.length > 0
      ? t("muscles__tile_value", { done: volume.onTarget, total: targets.length })
      : span === "four"
        ? t("muscles__avg_per_week", { sets: rounded })
        : t("stats__sets", { count: Math.round(volume.completedSets) });
  const axes = useMemo(
    () => muscleRadarAxes(volume.loads, volume.rows),
    [volume.loads, volume.rows],
  );
  const hasTarget = axes.some((axis) => axis.target !== null);
  const axisName = (key: (typeof axes)[number]["key"]) => t(`muscles__axis_${key}`);
  const radarAxes = useMemo(
    () =>
      axes.map((axis) => ({
        key: axis.key,
        label: t(`muscles__axis_${axis.key}`),
        value: radarValue(axis),
        target: axis.target,
      })),
    [axes, t],
  );
  const peak = Math.max(1, ...volume.loads.map((load) => load.sets));
  const intensity: Partial<Record<BodyGroup, number>> = {};
  for (const [muscle, value] of bodyIntensity(volume.loads, volume.rows))
    if (isBodyGroup(muscle)) intensity[muscle] = value;
  const dark = useThemeMode() === "dark";
  const artTint = useMemo(() => muscleArtTint(colors.identity, dark), [colors.identity, dark]);
  const canPrevious = weeksAgo < MAX_WEEKS_AGO;
  const canNext = weeksAgo > 0;
  const step = (by: -1 | 1) => {
    // Next (+1) moves toward today, which is fewer weeks ago.
    const next = Math.min(MAX_WEEKS_AGO, Math.max(0, weeksAgo - by));
    if (next === weeksAgo) return;
    haptic.tick();
    setDirection(by);
    setWeeksAgo(next);
  };
  return (
    <ScrollPage title={t("muscles__title")} back backFallback="/">
      <SegmentedControl
        options={options}
        value={span}
        accessibilityLabel={t("muscles__period_label")}
        onChange={(next) => {
          setDirection(0);
          setSpan(next);
        }}
      />
      {volume.failed ? (
        <Button variant="secondary" onPress={volume.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : volume.loading || !program.ready ? null : (
        <FadeIn className="gap-6">
          <PeriodCard
            title={title}
            period={`${span}-${weeksAgo}`}
            direction={direction}
            canPrevious={canPrevious}
            canNext={canNext}
            previousLabel={t("muscles__previous_week")}
            nextLabel={t("muscles__next_week")}
            onMove={step}
            headline={
              <Text className="text-numeric-md tabular-nums text-foreground">{headlineText}</Text>
            }
          >
            <View className="gap-2">
              <RadarChart
                axes={radarAxes}
                accessibilityLabel={t("muscles__radar_label", {
                  values: axes
                    .map((axis) => {
                      const format = new Intl.NumberFormat(i18n.language, {
                        maximumFractionDigits: 1,
                      });
                      return axis.target === null
                        ? t("muscles__radar_value", {
                            axis: axisName(axis.key),
                            sets: format.format(radarValue(axis)),
                          })
                        : t("muscles__radar_value_target", {
                            axis: axisName(axis.key),
                            sets: format.format(radarValue(axis)),
                            target: format.format(axis.target),
                          });
                    })
                    .join(", "),
                })}
              />
              <Text className="text-center text-caption text-muted">
                {t(hasTarget ? "muscles__radar_caption_target" : "muscles__radar_caption")}
              </Text>
            </View>
          </PeriodCard>
          <View className="gap-4 rounded-2xl bg-surface p-4">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="font-semibold text-title-md text-foreground">
                {t("muscles__map_title")}
              </Text>
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
              <Text className="text-caption text-muted">{t("muscles__map_sample_caption")}</Text>
            ) : null}
            <View className="w-full max-w-[340px] gap-3 self-center rounded-xl bg-background p-3">
              <BodyMapPair
                intensity={sampleVisible ? SAMPLE_INTENSITY : intensity}
                artTint={artTint}
              />
              <View className="flex-row gap-4" accessible={false} aria-hidden>
                <Text className="flex-1 text-center text-caption text-muted">
                  {t("bodymap__view_front")}
                </Text>
                <Text className="flex-1 text-center text-caption text-muted">
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
                  <Text className="text-caption text-muted">{t(`muscles__map_${level}`)}</Text>
                </View>
              ))}
            </View>
            <Text className="text-center text-caption text-muted">
              {t(targets.length === 0 ? "muscles__map_volume_caption" : "muscles__map_caption")}
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
          contributions={volume.contributions(chosen)}
          onChange={(goal) => volume.setGoal(chosen, goal)}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </ScrollPage>
  );
}
