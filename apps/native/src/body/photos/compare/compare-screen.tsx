import { ChangeLine, changeDirection } from "@/body/change-line";
import { BodyState } from "@/body/body-state";
import { PhotoDatePicker } from "./photo-date-picker";
import { useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import {
  PROGRESS_POSES,
  defaultCompareDates,
  formatBodyValue,
  formatBodyWeight,
  photoOnDate,
  type ProgressPose,
} from "@workspace/shared";

import { MediaImage } from "@/media";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Compare } from "@/platform/ui/compare";
import { ScrollPage } from "@/platform/ui/page";

import { useMeasurements } from "@/body/measurements/use-measurements";
import { useWeight } from "@/body/weight/use-weight";
import { sideStats, statsChange, type SideStats } from "./compare-stats";
import { formatCalendarDate } from "@/body/photos/local-date";
import { poseLabels } from "@/body/photos/pose-labels";
import {
  useComparePhotos,
  usePoseDates,
  usePoseSummaries,
} from "@/body/photos/use-progress-photos";

const SIDE = 16;

type Picks = { before?: string; after?: string };

/**
 * Compare (ADR 0041): one pose on two dates, side by side under a Compare slider. The pose and
 * the two dates are chosen from a photo calendar (defaults: the first and latest dates), and
 * under each side sit the weight trend and the waist on that date. A pose with fewer than two
 * dates says so. Photos here are shown clear: opening Compare is the reader's own choice.
 */
export function CompareScreen() {
  const { t, i18n } = useTranslation();
  const { width, height } = useWindowDimensions();
  const summaries = usePoseSummaries();
  const weight = useWeight();
  const measurements = useMeasurements();
  const [chosen, setChosen] = useState<ProgressPose | null>(null);
  const [picking, setPicking] = useState<"before" | "after" | null>(null);
  const [picks, setPicks] = useState<Picks>({});

  // Until a pose is chosen: the first one that has two dates to compare.
  const pose =
    chosen ??
    PROGRESS_POSES.find((p) =>
      summaries.value?.some((summary) => summary.pose === p && summary.dates >= 2),
    ) ??
    "front";
  const recentDates = usePoseDates(pose);
  const first = summaries.value?.find((summary) => summary.pose === pose)?.first;
  const dates = [...new Set([...(first ? [first] : []), ...(recentDates.value ?? [])])].sort();
  const defaults = defaultCompareDates(dates);
  const before = picks.before && dates.includes(picks.before) ? picks.before : defaults.before;
  const after = picks.after && dates.includes(picks.after) ? picks.after : defaults.after;
  const photos = useComparePhotos(pose, before, after);
  const frame = Math.min(Math.round(((width - SIDE * 2) * 4) / 3), Math.round(height * 0.6));
  const date = (value: string) => formatCalendarDate(value, i18n.language);

  const pickBefore = (value: string) =>
    setPicks(
      after !== null && value > after
        ? { before: after, after: value }
        : { ...picks, before: value },
    );
  const pickAfter = (value: string) =>
    setPicks(
      before !== null && value < before
        ? { before: value, after: before }
        : { ...picks, after: value },
    );

  const waist = measurements.forMetric("waist");
  const beforeStats = before ? sideStats(before, weight.series, waist) : null;
  const afterStats = after ? sideStats(after, weight.series, waist) : null;
  const change = beforeStats && afterStats ? statsChange(beforeStats, afterStats) : null;
  const beforePhoto = before ? photoOnDate(photos.photos, pose, before) : null;
  const afterPhoto = after ? photoOnDate(photos.photos, pose, after) : null;
  const ready = before !== null && after !== null && beforePhoto && afterPhoto;

  const weightText = (kg: number) =>
    t("body__value", {
      value: formatBodyWeight(kg, weight.unit, i18n.language),
      unit: weight.unit,
    });
  const waistText = (cm: number) =>
    t("body__value", {
      value: formatBodyValue(measurements.display("waist", cm), i18n.language),
      unit: measurements.unit("waist"),
    });

  const stats = (side: SideStats | null, delta: SideStats | null, since: string | null) => (
    <View className="flex-1 gap-2">
      <View className="gap-1">
        <Text className="font-normal text-caption text-muted">{t("body__compare_trend")}</Text>
        <Text className="font-medium text-numeric-md tabular-nums text-foreground">
          {side?.weightKg == null ? t("body__no_data") : weightText(side.weightKg)}
        </Text>
        {delta?.weightKg != null && since ? (
          <ChangeLine
            direction={changeDirection(delta.weightKg)}
            text={t("body__compare_change", {
              value: formatBodyWeight(Math.abs(delta.weightKg), weight.unit, i18n.language),
              unit: weight.unit,
              date: date(since),
            })}
          />
        ) : null}
      </View>
      <View className="gap-1">
        <Text className="font-normal text-caption text-muted">{t("body__compare_waist")}</Text>
        <Text className="font-medium text-numeric-md tabular-nums text-foreground">
          {side?.waistCm == null ? t("body__no_data") : waistText(side.waistCm)}
        </Text>
        {delta?.waistCm != null && since ? (
          <ChangeLine
            direction={changeDirection(delta.waistCm)}
            text={t("body__compare_change", {
              value: formatBodyValue(
                Math.abs(measurements.display("waist", delta.waistCm)),
                i18n.language,
              ),
              unit: measurements.unit("waist"),
              date: date(since),
            })}
          />
        ) : null}
      </View>
    </View>
  );

  const dateButton = (side: "before" | "after", selected: string | null) => (
    <Button variant="secondary" onPress={() => setPicking(side)}>
      <Button.Label>
        {t("body__compare_date_label", {
          side: t(side === "before" ? "body__compare_before" : "body__compare_after"),
          date: selected ? date(selected) : t("body__no_data"),
        })}
      </Button.Label>
    </Button>
  );

  return (
    <ScrollPage back title={t("body__compare_title")}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {PROGRESS_POSES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === pose ? "primary" : "tertiary"}
            accessibilityLabel={t("body__pose_filter", { pose: t(poseLabels[value]) })}
            accessibilityState={{ selected: value === pose }}
            onPress={() => {
              setChosen(value);
              setPicks({});
            }}
          >
            <Button.Label>{t(poseLabels[value])}</Button.Label>
          </Button>
        ))}
      </ScrollView>
      {photos.failed ||
      summaries.failed ||
      recentDates.failed ||
      photos.loading ||
      summaries.loading ||
      recentDates.loading ||
      !ready ? (
        <BodyState
          loading={photos.loading || summaries.loading || recentDates.loading}
          failed={photos.failed || summaries.failed || recentDates.failed}
          retry={() => {
            photos.retry();
            summaries.retry();
            recentDates.retry();
          }}
          empty={t("body__compare_need_two", { pose: t(poseLabels[pose]) })}
        />
      ) : (
        <>
          <Compare height={frame} handleLabel={t("body__compare_handle")}>
            <Compare.After>
              <MediaImage
                mediaId={afterPhoto.media_id}
                variant="full"
                size={width - SIDE * 2}
                height={frame}
                rounded=""
              />
            </Compare.After>
            <Compare.Before>
              <MediaImage
                mediaId={beforePhoto.media_id}
                variant="full"
                size={width - SIDE * 2}
                height={frame}
                rounded=""
              />
            </Compare.Before>
            <Compare.Label side="start">{date(before)}</Compare.Label>
            <Compare.Label side="end">{date(after)}</Compare.Label>
            <Compare.Handle />
          </Compare>
          <View className="flex-row gap-4">
            {stats(beforeStats, null, null)}
            {stats(afterStats, change, before)}
          </View>
          {dateButton("before", before)}
          {dateButton("after", after)}
        </>
      )}
      {picking ? (
        <PhotoDatePicker
          dates={dates}
          selected={picking === "before" ? before : after}
          title={t(picking === "before" ? "body__compare_before" : "body__compare_after")}
          onPick={picking === "before" ? pickBefore : pickAfter}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </ScrollPage>
  );
}
