/**
 * Source: PanelUI HeatmapChart (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Keeps the contribution grid (a column per week, a row per weekday), one colour at several
 * opacities, SVG cells with the labels as native text, and the long-press tooltip that follows the
 * finger without stealing a scroll. Changes: one component instead of a compound, UTC calendar-day
 * columns from `heatmap-chart-math.ts`, empty cells in `surface-control` (HeroUI's `muted` is a
 * text colour), a `chart-*` tone, a two-level mode for done / not done, and every string (month,
 * tooltip, summary) from the caller. Cells whose value changes fade to it; nothing animates on mount.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useCSSVariable } from "uniwind";

import { isColorString } from "@/platform/theme";

import { useReduceMotion } from "./use-reduce-motion";

import {
  HEATMAP_ROWS,
  cellAtPoint,
  deriveLevels,
  heatmapLevel,
  levelOpacity,
  monthStarts,
  type HeatmapBin,
  type HeatmapColumn,
} from "./heatmap-chart-math";

export type { HeatmapBin, HeatmapColumn };

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const GAP = 3;
const CHANGE_MS = 200;
const REDUCED_MS = 120;
const HOLD_MS = 180;
const MONTH_ROW = 16;
const TOOLTIP_HEIGHT = 28;

export function HeatmapChart({
  columns,
  tone = "chart-1",
  binary = false,
  labels,
}: {
  columns: readonly HeatmapColumn[];
  /** The family colour the ramp is drawn in. */
  tone?: "chart-1" | "chart-2";
  /** Two levels, done or not, instead of a ramp by count. */
  binary?: boolean;
  labels: {
    /** The whole chart for a screen reader. */
    summary: string;
    month: (day: number) => string;
    /** The tooltip line of a day. */
    cell: (bin: HeatmapBin) => string;
  };
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<{ column: number; row: number } | null>(null);
  const one = useCSSVariable("--color-chart-1");
  const two = useCSSVariable("--color-chart-2");
  const track = useCSSVariable("--color-default");
  const base = tone === "chart-1" ? one : two;
  const fill = isColorString(base) ? base : "#888888";
  const empty = isColorString(track) ? track : "#88888833";

  const count = columns.length;
  const size = count === 0 ? 0 : Math.max(Math.floor((width - (count - 1) * GAP) / count), 4);
  const step = size + GAP;
  const thresholds = useMemo(() => (binary ? [1] : deriveLevels(columns)), [binary, columns]);
  const months = useMemo(() => monthStarts(columns), [columns]);
  const gridHeight = HEATMAP_ROWS * step - GAP;

  const pick = (x: number, y: number) => {
    const cell = cellAtPoint(x, y, size, GAP, count);
    setActive((current) =>
      current?.column === cell?.column && current?.row === cell?.row ? current : cell,
    );
  };
  const clear = () => setActive(null);
  const pan = usePanGesture({
    // Only the timer may start the readout, so a swipe still scrolls the screen.
    minDistance: 10_000,
    activateAfterLongPress: HOLD_MS,
    onActivate: (event) => scheduleOnRN(pick, event.x, event.y),
    onUpdate: (event) => scheduleOnRN(pick, event.x, event.y),
    onDeactivate: () => scheduleOnRN(clear),
    onFinalize: () => scheduleOnRN(clear),
  });

  const bin = active ? columns[active.column]?.bins[active.row] : undefined;
  const flipped = active !== null && active.column * step > width / 2;
  const below = (active?.row ?? 0) < 2;
  const anchorX = active ? active.column * step + size / 2 : 0;
  const anchorY = active
    ? below
      ? active.row * step + size + 6
      : active.row * step - TOOLTIP_HEIGHT - 6
    : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={labels.summary}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      className="gap-1"
    >
      {width > 0 && size > 0 ? (
        <>
          <GestureDetector gesture={pan}>
            <View style={{ height: gridHeight }}>
              <Svg width={width} height={gridHeight} accessible={false}>
                {columns.map((column) =>
                  column.bins.map((item) => {
                    if (!item.inRange) return null;
                    const level = heatmapLevel(item.count, thresholds);
                    const dimmed =
                      active !== null &&
                      !(active.column === column.column && active.row === item.row);
                    return (
                      <Cell
                        key={`${column.column}-${item.row}`}
                        x={column.column * step}
                        y={item.row * step}
                        size={size}
                        color={level === 0 ? empty : fill}
                        opacity={
                          (level === 0 ? 1 : levelOpacity(level, thresholds.length)) *
                          (dimmed ? 0.5 : 1)
                        }
                      />
                    );
                  }),
                )}
              </Svg>
              {bin?.inRange ? (
                <View
                  pointerEvents="none"
                  className="absolute rounded-lg bg-overlay px-2 py-1"
                  style={{
                    top: anchorY,
                    [flipped ? "right" : "left"]: flipped ? width - anchorX : anchorX,
                  }}
                >
                  <Text numberOfLines={1} className="text-caption tabular-nums text-foreground">
                    {labels.cell(bin)}
                  </Text>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          <View
            style={{ height: MONTH_ROW }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {months.map((month) => (
              <Text
                key={month.column}
                numberOfLines={1}
                className="absolute text-caption text-muted"
                style={{ left: month.column * step }}
              >
                {labels.month(month.day)}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * One square. Its opacity eases to a new value only when that value changes, so a grid that
 * re-renders with the same data stays still, and only the cells whose counts moved animate
 * (a 120ms fade under Reduce Motion). It starts at its first value.
 */
const Cell = memo(function Cell({
  x,
  y,
  size,
  color,
  opacity,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}) {
  const reduced = useReduceMotion();
  const value = useSharedValue(opacity);
  useEffect(() => {
    value.set(
      withTiming(opacity, {
        duration: reduced ? REDUCED_MS : CHANGE_MS,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [opacity, reduced, value]);
  const animatedProps = useAnimatedProps(() => ({ fillOpacity: value.get() }));
  return (
    <AnimatedRect
      x={x}
      y={y}
      width={size}
      height={size}
      rx={2}
      ry={2}
      fill={color}
      animatedProps={animatedProps}
    />
  );
});
