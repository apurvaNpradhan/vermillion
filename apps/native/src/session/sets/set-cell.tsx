import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { INK_MS } from "@/session/shared/motion";

const INK_TRANSITION = { transitionProperty: ["color"], transitionDuration: INK_MS } as const;

/**
 * One cell of the set grid: a pressable, never a text input (the keypad types into it). It shows
 * the value in full ink, or the Ghost value in faint ink when empty, or a dash. A Ghost value that
 * becomes the value (the set was ticked) cross-fades from faint to full ink through a Reanimated CSS
 * transition on the UI thread; a cell that mounts with its value does not animate. There is no box:
 * the cell being edited has a 2px accent underline, and a refused tick underlines the cell in danger.
 */
export function SetCell({
  text,
  ghost,
  animate,
  active,
  refused,
  ink,
  faint,
  label,
  onPress,
  disabled,
  children,
}: {
  /** The value as text; empty when the cell has none. */
  text: string;
  /** The Ghost value as text, shown muted when `text` is empty. */
  ghost: string;
  animate: boolean;
  active: boolean;
  refused: boolean;
  /** The theme's full and faint ink, as colors (a transition needs the value, not a class). */
  ink: string;
  faint: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Replaces the text, for a cell that shows something live (a running timer). */
  children?: React.ReactNode;
}) {
  const empty = text === "";
  const bar = refused ? "bg-danger" : active ? "bg-accent" : "bg-transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: empty ? (ghost === "" ? undefined : ghost) : text }}
      disabled={disabled}
      onPress={onPress}
      className="h-10 min-w-0 flex-1 flex-row items-center justify-center rounded-lg px-1 active:bg-default"
    >
      <View className="min-w-0 items-center">
        {children ?? (
          <Animated.Text
            numberOfLines={1}
            className="font-normal text-center text-body"
            style={{
              fontVariant: ["tabular-nums"],
              color: empty ? faint : ink,
              ...INK_TRANSITION,
              transitionDuration: animate ? INK_MS : 0,
            }}
          >
            {empty ? (ghost === "" ? "–" : ghost) : text}
          </Animated.Text>
        )}
        <View className={`h-[2px] min-w-6 self-stretch rounded-full ${bar}`} />
      </View>
    </Pressable>
  );
}
