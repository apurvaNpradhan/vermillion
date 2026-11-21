/**
 * Source: PanelUI RadarChart (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Keeps the polygonal rings and spokes, the labels anchored by side and the per-vertex morph when
 * the data changes. Changes: no reveal on mount (one fill, on a change of value, and a 120 ms fade
 * under Reduce Motion; nothing replays when a parent re-renders with the same values), one component
 * instead of a compound, one profile plus an optional target outline (dashed, never filled),
 * `chart-1` and role tokens, labels and the summary from the caller, no legend, no dots and no
 * `tailwind-variants`. The geometry lives in `radar-chart-math.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { brandTokens, nativeColors } from "@workspace/ui/tokens/brand";

import { isColorString, useAppliedVariant, useSubtleColor } from "@/platform/theme";

import {
  labelAnchor,
  polarPoint,
  radarDomain,
  radarPath,
  ringPoints,
  toFractions,
} from "./radar-chart-math";
import { useReduceMotion } from "./use-reduce-motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Room around the rings for the horizontal axis labels: wider than it is tall. */
const LABEL_ROOM = { x: 54, y: 24 };
const BARE_ROOM = { x: 6, y: 6 };
/** motion-slow: the shape fills to its new values. */
const MORPH_MS = 320;
/** motion-fast: the fade that replaces the fill under Reduce Motion. */
const FADE_MS = 120;
const RINGS = 3;

export type RadarAxis = {
  key: string;
  label: string;
  value: number;
  /** Where the target outline passes this axis; null leaves the axis out of the outline. */
  target?: number | null;
};

export function RadarChart({
  axes,
  max,
  size = 176,
  compact = false,
  accessibilityLabel,
}: {
  /** One entry per axis, in the order they go round: the order is the outline. */
  axes: readonly RadarAxis[];
  /** Fixes the outer ring; otherwise the biggest value or target. */
  max?: number;
  /** Diameter of the outer ring in points. */
  size?: number;
  /** No labels: a thumbnail of the shape. */
  compact?: boolean;
  accessibilityLabel: string;
}) {
  const room = compact ? BARE_ROOM : LABEL_ROOM;
  const width = size + room.x * 2;
  const height = size + room.y * 2;
  const [box, setBox] = useState({ width, height });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setBox((current) =>
      current.width === w && current.height === h ? current : { width: w, height: h },
    );
  };
  const cx = box.width / 2;
  const cy = box.height / 2;
  const radius = Math.max(Math.min(box.width / 2 - room.x, box.height / 2 - room.y), 0);

  const accent = useCSSVariable("--color-chart-1");
  const grid = useCSSVariable("--color-border");
  const subtle = useSubtleColor();
  // The role tokens stand in until the CSS variables resolve, never a raw grey.
  const roles = nativeColors[useAppliedVariant()];
  const stroke = isColorString(accent) ? accent : roles["chart-1"];
  const lines = isColorString(grid) ? grid : roles.hairline;
  const labelColor = subtle ?? roles["text-secondary"];

  const values = useMemo(() => axes.map((axis) => axis.value), [axes]);
  const targets = useMemo(() => axes.map((axis) => axis.target ?? null), [axes]);
  const hasTarget = targets.some((target) => target !== null);
  const domain = radarDomain(values, targets, max);
  const fractions = useMemo(() => toFractions(values, domain), [values, domain]);
  const targetFractions = useMemo(() => toFractions(targets, domain), [targets, domain]);

  const reduced = useReduceMotion();
  const from = useSharedValue<(number | null)[]>(fractions);
  const to = useSharedValue<(number | null)[]>(fractions);
  const morph = useSharedValue(1);
  const fade = useSharedValue(1);
  const settled = useRef(false);
  // The effect runs when the drawn values change, not when a parent re-renders with equal ones.
  const drawn = fractions.join(",");

  useEffect(() => {
    if (!settled.current) {
      // The first values are drawn as they are: the screen already fades in as a whole.
      settled.current = true;
      from.set(fractions);
      to.set(fractions);
      morph.set(1);
      return;
    }
    if (reduced) {
      from.set(fractions);
      to.set(fractions);
      morph.set(1);
      fade.set(0);
      fade.set(withTiming(1, { duration: FADE_MS, reduceMotion: ReduceMotion.Never }));
      return;
    }
    // Leave from wherever the last tween had got to.
    const progress = morph.get();
    const previous = from.get();
    from.set(
      to.get().map((value, index) => {
        const start = previous[index] ?? value;
        return value === null || start === null ? value : start + (value - start) * progress;
      }),
    );
    to.set(fractions);
    morph.set(0);
    morph.set(withTiming(1, { duration: MORPH_MS, easing: Easing.out(Easing.cubic) }));
  }, [drawn, reduced]);

  const animatedProps = useAnimatedProps(() => {
    const target = to.get();
    const start = from.get();
    const scaled = target.map((value, index) => {
      const a = start[index] ?? value;
      if (value === null || a === null) return null;
      return a + (value - a) * morph.get();
    });
    return {
      d: radarPath(scaled, cx, cy, radius),
      fillOpacity: 0.2 * fade.get(),
      strokeOpacity: fade.get(),
    };
  });

  const count = axes.length;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      className="self-center"
      style={{ width, height, maxWidth: "100%" }}
    >
      {radius > 0 && count >= 3 ? (
        <Svg width="100%" height="100%" accessible={false}>
          <G>
            {Array.from({ length: RINGS }, (_, ring) => (
              <Polygon
                key={ring}
                points={ringPoints(count, cx, cy, ((ring + 1) / RINGS) * radius)}
                fill="none"
                stroke={lines}
                strokeWidth={1}
              />
            ))}
            {axes.map((axis, index) => {
              const end = polarPoint(cx, cy, radius, index / count);
              return (
                <Line
                  key={axis.key}
                  x1={cx}
                  y1={cy}
                  x2={end.x}
                  y2={end.y}
                  stroke={lines}
                  strokeWidth={1}
                />
              );
            })}
          </G>
          {hasTarget ? (
            <Path
              d={radarPath(targetFractions, cx, cy, radius)}
              fill="none"
              stroke={labelColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeLinejoin="round"
            />
          ) : null}
          <AnimatedPath
            animatedProps={animatedProps}
            fill={stroke}
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {compact
            ? null
            : axes.map((axis, index) => {
                const point = polarPoint(cx, cy, radius + 10, index / count);
                const anchor = labelAnchor(point.x - cx, radius);
                // SVG clips at its viewport, so pull a long label back inside.
                const estimated = axis.label.length * 11 * 0.55;
                const x =
                  anchor === "start"
                    ? Math.min(point.x, Math.max(box.width - estimated, cx))
                    : anchor === "end"
                      ? Math.max(point.x, Math.min(estimated, cx))
                      : point.x;
                const y = Math.min(Math.max(point.y + (point.y < cy ? 0 : 8), 11), box.height - 2);
                return (
                  <SvgText
                    key={axis.key}
                    x={x}
                    y={y}
                    fill={labelColor}
                    fontSize={11}
                    fontFamily={brandTokens.fonts.native.medium}
                    textAnchor={anchor}
                  >
                    {axis.label}
                  </SvgText>
                );
              })}
        </Svg>
      ) : null}
    </View>
  );
}
