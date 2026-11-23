/**
 * Interaction adapted from PanelUI LineChart docs, retrieved 2026-11-10 (unversioned).
 * https://panelui.dev/docs/charts/line-chart — MIT, Copyright (c) 2026 Khalid Abdi.
 * Licence: docs/licenses/panelui-MIT.txt. Changes: Vermillion tokens, native text axes,
 * range chips, SVG bars, nearest-point scrub with JS notified only on index changes, weekly
 * aggregation, an accent line over a faint area, a dashed best line and a scrub tooltip.
 */
import { useThemeColor } from "heroui-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useChartColor } from "@/platform/theme";
import { Button } from "../button";
import {
  aggregateByWeek,
  dataTicks,
  nearestIndex,
  labelledTicks,
  rangePoints,
  scale,
  ticks,
  type Aggregate,
  type ChartPoint,
  type ChartRange,
  type ChartWeek,
} from "./scales";

const TOOLTIP_WIDTH = 112;

type Props = {
  showRanges?: boolean;
  secondaryPoints?: readonly ChartPoint[];
  goal?: number | null;
  /** "data" fits the axis to the values instead of starting at zero. */
  domain?: "data";
  /** Round steps for the axis when it is not decimal (`TIME_STEPS` for seconds). */
  tickSteps?: readonly number[];
  /**
   * How a week's sessions combine once the range is longer than three months: the best of the
   * week, the lowest (lower is better) or the total. The chart shows one point per week then,
   * and one per session over three months.
   */
  aggregate?: Aggregate;
  /** The account's week (time zone and first day) the weekly points follow; UTC Monday if omitted. */
  week?: ChartWeek;
  /** A smaller value is better (pace): the axis runs the other way, so better plots higher. */
  lowerIsBetter?: boolean;
  /** A dashed reference line at the best value shown (the PR), the highest or the lowest. */
  best?: "high" | "low";
  hideDots?: ReadonlySet<string>;
  points: readonly ChartPoint[];
  label: string;
  formatValue: (value: number) => string;
  /**
   * The headline for the selected point (or the latest one), when the default "Label · date ·
   * value" line is not wanted. It is shown larger.
   */
  readout?: (point: ChartPoint) => string;
  /** Rendered under the chart, below its date axis (metric chips). */
  footer?: ReactNode;
  /** Chips that share the range chips' row, before them (the metric to draw). */
  leading?: ReactNode;
};

export function LineChart(props: Props) {
  return <Chart {...props} mode="line" />;
}
export function BarChart(props: Props) {
  return <Chart {...props} mode="bar" />;
}

function Chart({
  points,
  label,
  formatValue,
  mode,
  showRanges = true,
  readout,
  footer,
  leading,
  secondaryPoints = [],
  goal,
  domain: domainProp,
  tickSteps,
  aggregate = "max",
  week,
  lowerIsBetter = false,
  best,
  hideDots,
}: Props & { mode: "line" | "bar" }) {
  const { t } = useTranslation();
  const ink = useChartColor();
  const border = useThemeColor("border");
  const [range, setRange] = useState<ChartRange>("3M");
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(-1);
  const index = useSharedValue(-1);
  const cursor = useSharedValue(0);
  const weekTimezone = week?.timezone;
  const weekStart = week?.weekStart;
  const data = useMemo(() => {
    if (!showRanges) return points;
    const inRange = rangePoints(points, range, Date.now());
    return range === "3M"
      ? inRange
      : aggregateByWeek(
          inRange,
          aggregate,
          weekTimezone && weekStart ? { timezone: weekTimezone, weekStart } : undefined,
        );
  }, [points, range, showRanges, aggregate, weekTimezone, weekStart]);
  const domain = lowerIsBetter ? "data" : domainProp;
  const values = [
    ...data.map((p) => p.y),
    ...secondaryPoints.map((p) => p.y),
    ...(goal == null ? [] : [goal]),
  ];
  const grid = domain === "data" ? dataTicks(values, tickSteps) : ticks(values);
  const low = grid[0] ?? 0;
  const max = grid[grid.length - 1] ?? 1;
  const bestValue =
    best && data.length > 1
      ? best === "high"
        ? Math.max(...data.map((p) => p.y))
        : Math.min(...data.map((p) => p.y))
      : null;
  const plotWidth = Math.max(0, width - 16);
  const first = data[0];
  const last = data[data.length - 1];
  const positions = data.map((p, i) =>
    mode === "bar"
      ? ((i + 0.5) / data.length) * plotWidth + 8
      : scale(p.x, [first?.x ?? 0, last?.x ?? 0], plotWidth) + 8,
  );
  const y = (value: number) =>
    lowerIsBetter ? 8 + scale(value, [low, max], 152) : 160 - scale(value, [low, max], 152);
  const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${positions[i]},${y(p.y)}`).join(" ");
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((event) => {
      const next = nearestIndex(positions, event.x);
      index.value = next;
      cursor.value = positions[next] ?? 0;
      scheduleOnRN(setActive, next);
    })
    .onUpdate((event) => {
      const next = nearestIndex(positions, event.x);
      cursor.value = positions[next] ?? 0;
      if (index.value !== next) {
        index.value = next;
        scheduleOnRN(setActive, next);
      }
    })
    .onFinalize(() => {
      index.value = -1;
      scheduleOnRN(setActive, -1);
    });
  const tap = Gesture.Tap().onEnd((event, success) => {
    if (success) scheduleOnRN(setActive, nearestIndex(positions, event.x));
  });
  const interaction = Gesture.Exclusive(pan, tap);
  const cursorStyle = useAnimatedStyle(() => ({
    opacity: index.value < 0 ? 0 : 1,
    transform: [{ translateX: cursor.value }],
  }));
  const shown = data[active] ?? last;
  // Scrubbing ticks once per point it passes over.
  const scrubbed = useRef(-1);
  useEffect(() => {
    if (active >= 0 && scrubbed.current !== active) haptic.tick();
    scrubbed.current = active;
  }, [active]);
  const tooltipLeft = Math.min(
    Math.max((positions[active] ?? 0) - TOOLTIP_WIDTH / 2, 0),
    Math.max(0, width - TOOLTIP_WIDTH),
  );
  return (
    <View className="gap-3">
      {showRanges || leading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2"
        >
          {leading}
          {showRanges
            ? (["3M", "1Y", "All"] satisfies ChartRange[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={range === value ? "primary" : "tertiary"}
                  accessibilityState={{ selected: range === value }}
                  onPress={() => {
                    setRange(value);
                    setActive(-1);
                  }}
                >
                  <Button.Label>
                    {t(
                      value === "3M"
                        ? "charts__three_months"
                        : value === "1Y"
                          ? "charts__one_year"
                          : "charts__all",
                    )}
                  </Button.Label>
                </Button>
              ))
            : null}
        </ScrollView>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        className={
          readout ? "font-semibold text-title-lg text-foreground" : "text-body text-foreground"
        }
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {shown
          ? readout
            ? readout(shown)
            : t("charts__readout", { label, date: shown.label, value: formatValue(shown.y) })
          : t("charts__empty")}
      </Text>
      {data.length ? (
        <>
          <View className="flex-row gap-2">
            <View style={{ height: 168, minWidth: 64 }}>
              {labelledTicks(grid, formatValue)
                .reverse()
                .map((tick) => (
                  <Text
                    key={tick}
                    className="font-normal text-caption text-muted"
                    style={{
                      fontVariant: ["tabular-nums"],
                      position: "absolute",
                      top: y(tick) - 8,
                    }}
                  >
                    {formatValue(tick)}
                  </Text>
                ))}
            </View>
            <GestureDetector gesture={interaction}>
              <View
                className="flex-1"
                onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={label}
                accessibilityValue={{
                  min: 1,
                  max: data.length,
                  now: (active < 0 ? data.length - 1 : active) + 1,
                  text: shown
                    ? t("charts__readout", {
                        label,
                        date: shown.label,
                        value: formatValue(shown.y),
                      })
                    : undefined,
                }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={(event) =>
                  setActive((current) =>
                    Math.max(
                      0,
                      Math.min(
                        data.length - 1,
                        (current < 0 ? data.length - 1 : current) +
                          (event.nativeEvent.actionName === "increment" ? 1 : -1),
                      ),
                    ),
                  )
                }
              >
                <Svg width={width} height={168} accessible={false}>
                  {grid.map((tick) => (
                    <Line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke={border} />
                  ))}
                  {bestValue !== null ? (
                    <Line
                      x1={0}
                      x2={width}
                      y1={y(bestValue)}
                      y2={y(bestValue)}
                      stroke={ink}
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                    />
                  ) : null}
                  {goal != null ? (
                    <Line
                      x1={0}
                      x2={width}
                      y1={y(goal)}
                      y2={y(goal)}
                      stroke={ink}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  ) : null}
                  {secondaryPoints.length ? (
                    <Path
                      d={secondaryPoints
                        .map(
                          (p, i) =>
                            `${i ? "L" : "M"}${scale(p.x, [first?.x ?? 0, last?.x ?? 0], plotWidth) + 8},${y(p.y)}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke={ink}
                      strokeOpacity={0.25}
                      strokeWidth={1}
                    />
                  ) : null}
                  {mode === "line" && data.length > 1 ? (
                    <Path
                      d={`${path} L${positions[positions.length - 1]},160 L${positions[0]},160 Z`}
                      fill={ink}
                      fillOpacity={0.12}
                    />
                  ) : null}
                  {mode === "line" ? (
                    <Path d={path} fill="none" stroke={ink} strokeWidth={2} />
                  ) : null}
                  {data.map((p, i) =>
                    mode === "bar" ? (
                      <Rect
                        key={p.id}
                        x={(positions[i] ?? 0) - Math.max(1, (plotWidth / data.length) * 0.3)}
                        y={y(p.y)}
                        width={Math.max(2, (plotWidth / data.length) * 0.6)}
                        height={160 - y(p.y)}
                        fill={ink}
                        fillOpacity={active >= 0 && active !== i ? 0.45 : 1}
                      />
                    ) : hideDots?.has(p.id) ? null : (
                      <Circle
                        key={p.id}
                        cx={positions[i]}
                        cy={y(p.y)}
                        r={active === i ? 5 : 3}
                        fill={ink}
                      />
                    ),
                  )}
                </Svg>
                {active >= 0 && shown ? (
                  <View
                    pointerEvents="none"
                    accessible={false}
                    className="absolute top-0 items-center rounded-lg bg-surface-floating px-2 py-1"
                    style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
                  >
                    <Text
                      className="font-semibold text-label text-foreground"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {formatValue(shown.y)}
                    </Text>
                    <Text
                      className="font-normal text-caption text-muted"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {shown.label}
                    </Text>
                  </View>
                ) : null}
                <Animated.View
                  pointerEvents="none"
                  className="absolute top-0 h-40 w-px bg-foreground"
                  style={cursorStyle}
                />
              </View>
            </GestureDetector>
          </View>
          <View className="flex-row justify-between">
            <Text
              className="font-normal text-caption text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {first?.label}
            </Text>
            {data.length > 1 ? (
              <Text
                className="font-normal text-caption text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {last?.label}
              </Text>
            ) : null}
          </View>
          {data.length === 1 ? (
            <Text className="font-normal text-caption text-muted">{t("charts__one_point")}</Text>
          ) : null}
        </>
      ) : null}
      {footer}
    </View>
  );
}
