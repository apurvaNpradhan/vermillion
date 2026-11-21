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

/** The spoken form of a change: its direction, then the amount. */
export function useChangeSpeech() {
  const { t } = useTranslation();
  return (direction: ChangeDirection, text: string) => `${t(directionLabels[direction])}, ${text}`;
}

/**
 * A caption saying how a value moved, led by a Phosphor arrow instead of a text glyph. It speaks
 * the change itself, unless `spoken` is false because an enclosing control already carries it in
 * its own label; then the whole line is hidden from screen readers.
 */
export function ChangeLine({
  direction,
  text,
  spoken = true,
}: {
  direction: ChangeDirection;
  text: string;
  spoken?: boolean;
}) {
  const speech = useChangeSpeech();
  const subtle = useSubtleColor();
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const hidden = spoken
    ? {}
    : ({
        importantForAccessibility: "no-hide-descendants",
        accessibilityElementsHidden: true,
      } as const);
  return (
    <View
      accessible={spoken}
      accessibilityLabel={spoken ? speech(direction, text) : undefined}
      className="flex-row items-center gap-1"
      {...hidden}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon size={20} color={subtle} />
      </View>
      <Text className="font-normal flex-1 text-caption text-muted">{text}</Text>
    </View>
  );
}
