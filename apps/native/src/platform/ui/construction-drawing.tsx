import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { isColorString } from "@/platform/theme";

import { construction } from "./construction-math";

const DRAWING = construction();

/**
 * The Sigil construction drawing (secondary motif G): a circle, a golden rectangle and the golden
 * spiral in hairlines. Empty states use it in the `muted` colour; it is never the logo and never
 * animated. Decorative, so hidden from screen readers. `size` is the height in points.
 */
export function ConstructionDrawing({ size = 170 }: { size?: number }) {
  const muted = useCSSVariable("--color-muted");
  const { viewBox, circle, rect, squares, spiral } = DRAWING;
  const scale = size / viewBox.height;
  const width = viewBox.width * scale;
  const stroke = isColorString(muted) ? muted : "none";
  // A hairline is one point wide whatever the drawing's size.
  const hairline = 1 / scale;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: size }}
    >
      <Svg
        width={width}
        height={size}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        fill="none"
        accessible={false}
      >
        <Circle {...circle} stroke={stroke} strokeWidth={hairline * 0.75} />
        <Rect {...rect} stroke={stroke} strokeWidth={hairline * 0.75} />
        {squares.map((d) => (
          <Path key={d} d={d} stroke={stroke} strokeWidth={hairline * 0.6} opacity={0.7} />
        ))}
        <Path d={spiral} stroke={stroke} strokeWidth={hairline * 1.25} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
