/**
 * Interaction adapted from PanelUI LineChart docs, retrieved 2026-11-10 (unversioned).
 * https://panelui.dev/docs/charts/line-chart — MIT, Copyright (c) 2026 Khalid Abdi.
 * Licence: docs/licenses/panelui-MIT.txt. Changes: Vermillion tokens, native text axes,
 * range chips, SVG bars, and nearest-point scrub with JS notified only on index changes.
 */
import { useThemeColor } from "heroui-native";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { useTranslation } from "@/platform/i18n";
import { Button } from "../button";
import {
  nearestIndex,
  rangePoints,
  scale,
  ticks,
  type ChartPoint,
  type ChartRange,
} from "./scales";

type Props = {
  points: readonly ChartPoint[];
  label: string;
  formatValue: (value: number) => string;
};

export function LineChart(props: Props) {
  return <Chart {...props} mode="line" />;
}
export function BarChart(props: Props) {
  return <Chart {...props} mode="bar" />;
}

function Chart({ points, label, formatValue, mode }: Props & { mode: "line" | "bar" }) {
  const { t } = useTranslation();
  const ink = useThemeColor("foreground");
  const border = useThemeColor("border");
  const [range, setRange] = useState<ChartRange>("3M");
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(-1);
  const index = useSharedValue(-1);
  const cursor = useSharedValue(0);
  const data = useMemo(() => rangePoints(points, range, Date.now()), [points, range]);
  const grid = ticks(data.map((p) => p.y));
  const max = grid[grid.length - 1] ?? 1;
  const plotWidth = Math.max(0, width - 16);
  const first = data[0];
  const last = data[data.length - 1];
  const positions = data.map((p, i) =>
    mode === "bar"
      ? ((i + 0.5) / data.length) * plotWidth + 8
      : scale(p.x, [first?.x ?? 0, last?.x ?? 0], plotWidth) + 8,
  );
  const y = (value: number) => 160 - scale(value, [0, max], 152);
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
  return (
    <View className="gap-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {(["3M", "1Y", "All"] satisfies ChartRange[]).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={range === value ? "secondary" : "tertiary"}
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
        ))}
      </ScrollView>
      <Text
        accessibilityLiveRegion="polite"
        className="text-body text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {shown
          ? t("charts__readout", { label, date: shown.label, value: formatValue(shown.y) })
          : t("charts__empty")}
      </Text>
      {data.length ? (
        <>
          <View className="flex-row gap-2">
            <View className="justify-between" style={{ height: 168 }}>
              {[...grid].reverse().map((tick) => (
                <Text
                  key={tick}
                  className="text-caption text-muted"
                  style={{ fontVariant: ["tabular-nums"] }}
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
                      />
                    ) : (
                      <Circle key={p.id} cx={positions[i]} cy={y(p.y)} r={3} fill={ink} />
                    ),
                  )}
                </Svg>
                <Animated.View
                  pointerEvents="none"
                  className="absolute top-0 h-40 w-px bg-foreground"
                  style={cursorStyle}
                />
              </View>
            </GestureDetector>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
              {first?.label}
            </Text>
            {data.length > 1 ? (
              <Text className="text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
                {last?.label}
              </Text>
            ) : null}
          </View>
          {data.length === 1 ? (
            <Text className="text-caption text-muted">{t("charts__one_point")}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
