import type { ReactNode } from "react";
import { Text, type TextStyle } from "react-native";

const WEIGHT = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
} as const;

/**
 * Text on a Share card. The card is a fixed 1080 × 1920 picture, so it never follows the device's
 * font scale. Sizes are card units; colours come from the card's palette.
 */
export function CardText({
  size,
  color,
  weight = "medium",
  lineHeight,
  tracking,
  upper = false,
  tabular = false,
  lines,
  style,
  children,
}: {
  size: number;
  color: string;
  weight?: keyof typeof WEIGHT;
  lineHeight?: number;
  /** Letter spacing in card units. */
  tracking?: number;
  upper?: boolean;
  /** Tabular figures, for numbers that line up. */
  tabular?: boolean;
  lines?: number;
  style?: TextStyle;
  children: ReactNode;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines}
      className={WEIGHT[weight]}
      style={[
        {
          fontSize: size,
          color,
          lineHeight: lineHeight ?? Math.round(size * 1.2),
          letterSpacing: tracking,
          textTransform: upper ? "uppercase" : undefined,
          fontVariant: tabular ? ["tabular-nums"] : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
