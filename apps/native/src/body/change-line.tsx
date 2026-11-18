import { ArrowDown, ArrowUp, Minus } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

export type ChangeDirection = "up" | "down" | "same";

/** Which way a change points; zero reads as the same. */
export function changeDirection(delta: number): ChangeDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "same";
}

const directionLabels = {
  up: "body__change_up",
  down: "body__change_down",
  same: "body__change_same",
} as const;

/** A caption saying how a value moved, led by a Phosphor arrow instead of a text glyph. */
export function ChangeLine({ direction, text }: { direction: ChangeDirection; text: string }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  return (
    <View
      accessible
      accessibilityLabel={`${t(directionLabels[direction])}, ${text}`}
      className="flex-row items-center gap-1"
    >
      <Icon size={20} color={subtle} />
      <Text className="flex-1 text-caption text-muted">{text}</Text>
    </View>
  );
}
