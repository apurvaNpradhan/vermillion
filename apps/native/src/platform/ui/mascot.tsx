import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { isColorString } from "@/platform/theme";

import { MASCOT_DOT_PATH, MASCOT_SHELL_PATH, MASCOT_VIEWBOX } from "./mascot-paths";

/**
 * - `muted`: the whole tortoise in the `muted` text token at reduced strength, for empty states.
 * - `brand`: the shell in the foreground colour and the dot in the accent (`identity`).
 */
export type MascotTone = "muted" | "brand";

const MUTED_OPACITY = 0.45;

/**
 * The Patina tortoise, drawn from the logo's outline paths. It is a mark, never an animation:
 * it does not move, fade or react. Decorative, so hidden from screen readers; the text beside it
 * says what the screen means. `size` is the width in points; the height follows the artwork.
 */
export function Mascot({ size = 96, tone = "muted" }: { size?: number; tone?: MascotTone }) {
  const muted = useCSSVariable("--color-muted");
  const foreground = useCSSVariable("--color-foreground");
  const identity = useCSSVariable("--color-identity");
  const shell = tone === "brand" ? foreground : muted;
  const dot = tone === "brand" ? identity : muted;
  const height = (size * MASCOT_VIEWBOX.height) / MASCOT_VIEWBOX.width;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height }}
    >
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${MASCOT_VIEWBOX.width} ${MASCOT_VIEWBOX.height}`}
        accessible={false}
      >
        <G opacity={tone === "muted" ? MUTED_OPACITY : 1}>
          <Path
            d={MASCOT_SHELL_PATH}
            fill={isColorString(shell) ? shell : "none"}
            fillRule="evenodd"
          />
          <Path d={MASCOT_DOT_PATH} fill={isColorString(dot) ? dot : "none"} fillRule="evenodd" />
        </G>
      </Svg>
    </View>
  );
}
