import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { isColorString } from "@/platform/theme";

const SIZE = { width: 390, height: 800 };

/**
 * Large, soft, rotated shapes, partly cropped by the screen edges: rounded squares plus a few
 * fitness and food silhouettes. Drawn in `surface-control` and `hairline` only, so they stay
 * far below the text in contrast. Decorative.
 */
export function WelcomeArt() {
  const [tone, line] = useCSSVariable(["--color-default", "--color-border"]).map((value) =>
    isColorString(value) ? value : "none",
  );
  const fill = tone ?? "none";
  const stroke = line ?? "none";
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Rounded square, top right. */}
        <Rect
          x={190}
          y={-10}
          width={220}
          height={220}
          rx={56}
          fill={fill}
          transform="rotate(18 300 100)"
        />
        {/* Water bottle, cropped by the top edge. */}
        <G transform="translate(120 -30) rotate(-14 45 120)">
          <Rect x={25} y={0} width={40} height={30} rx={10} fill={fill} />
          <Rect x={0} y={26} width={90} height={230} rx={38} fill={fill} />
          <Rect x={0} y={90} width={90} height={14} fill={stroke} />
        </G>
        {/* Plate, cropped by the left edge. */}
        <G transform="translate(10 300)">
          <Circle r={96} fill={fill} />
          <Circle r={58} fill="none" stroke={stroke} strokeWidth={6} />
        </G>
        {/* Dumbbell, cropped by the right edge. */}
        <G transform="translate(250 450) rotate(-24 120 54)">
          <Rect x={0} y={0} width={42} height={108} rx={18} fill={fill} />
          <Rect x={48} y={20} width={28} height={68} rx={12} fill={fill} />
          <Rect x={76} y={44} width={88} height={20} rx={10} fill={fill} />
          <Rect x={164} y={20} width={28} height={68} rx={12} fill={fill} />
          <Rect x={198} y={0} width={42} height={108} rx={18} fill={fill} />
        </G>
        {/* Apple, left. */}
        <G transform="translate(-24 470) rotate(-12 100 100)">
          <Circle cx={72} cy={110} r={70} fill={fill} />
          <Circle cx={132} cy={110} r={70} fill={fill} />
          <Rect x={96} y={10} width={12} height={40} rx={6} fill={fill} />
          <Ellipse cx={136} cy={30} rx={34} ry={16} fill={fill} transform="rotate(-24 136 30)" />
        </G>
        {/* Rounded square, bottom right. */}
        <Rect
          x={270}
          y={640}
          width={170}
          height={170}
          rx={46}
          fill={fill}
          transform="rotate(-16 355 725)"
        />
      </Svg>
    </View>
  );
}
