import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

/** The mason's mark, from docs/design/sigil/mark.svg (48-unit grid). Never redraw or rotate it. */
const MARK_PATHS = [
  "M22.4 6.8 L25.6 6.8 L25.2 42.5 L22.8 42.5 Z",
  "M24 5 L37.2 14.6 L35.6 16.6 L24 8.2 L12.4 16.6 L10.8 14.6 Z",
  "M15.2 27.1 L32.8 27.1 L32.2 29.6 L15.8 29.6 Z",
] as const;

/** The ember dot of mark A2 (`mark-ember.svg`), the brand's single red point. */
const EMBER_DOT = { cx: 36.5, cy: 37, r: 3.6 } as const;

/**
 * The Sigil mark. `ember` draws mark A2 (48pt and up, on brand surfaces); without it the plain
 * mark A is for small sizes. `color` is the ink; `emberColor` is the dot.
 */
export function SigilMark({
  size = 48,
  color,
  emberColor,
}: {
  size?: number;
  color: string;
  /** Mark A2: add the ember dot in this colour. */
  emberColor?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
        {MARK_PATHS.map((d) => (
          <Path key={d} d={d} fill={color} />
        ))}
        {emberColor ? <Circle {...EMBER_DOT} fill={emberColor} /> : null}
      </Svg>
    </View>
  );
}
