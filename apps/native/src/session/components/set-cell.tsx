import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/** The distance and speed of the shake that refuses a tick. */
const SHAKE = 6;
const SHAKE_MS = 60;

/**
 * One cell of the set grid: a pressable, never a text input (the keypad types into it). It shows
 * the value, or a muted Ghost value when empty, or a dash. While being edited it has the focus
 * ring; when a tick was refused for it, a danger outline and a shake (`refusedNonce` changes on
 * each refusal, so it shakes again).
 */
export function SetCell({
  text,
  done = false,
  ghost,
  active,
  refused,
  refusedNonce,
  label,
  onPress,
  disabled,
  children,
}: {
  /** The value as text; empty when the cell has none. */
  text: string;
  done?: boolean;
  /** The Ghost value as text, shown muted when `text` is empty. */
  ghost: string;
  active: boolean;
  refused: boolean;
  refusedNonce: number;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Replaces the text, for a cell that shows something live (a running timer). */
  children?: React.ReactNode;
}) {
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!refused || refusedNonce === 0) return;
    offset.value = withSequence(
      withTiming(-SHAKE, { duration: SHAKE_MS, reduceMotion: ReduceMotion.System }),
      withTiming(SHAKE, { duration: SHAKE_MS, reduceMotion: ReduceMotion.System }),
      withTiming(-SHAKE, { duration: SHAKE_MS, reduceMotion: ReduceMotion.System }),
      withTiming(0, { duration: SHAKE_MS, reduceMotion: ReduceMotion.System }),
    );
    // Only a new refusal shakes the cell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusedNonce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const empty = text === "";
  const border = refused ? "border-danger" : active ? "border-focus-ring" : "border-transparent";
  return (
    <Animated.View className="min-w-0 flex-1" style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: empty ? (ghost === "" ? undefined : ghost) : text }}
        disabled={disabled}
        onPress={onPress}
        className={`h-10 flex-row items-center justify-center rounded-lg border px-1 ${border} ${active ? "bg-default" : done ? "bg-transparent" : "bg-field"}`}
      >
        {children ?? (
          <Text
            numberOfLines={1}
            className={`text-center text-body ${empty ? "text-muted" : "text-foreground"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {empty ? (ghost === "" ? "–" : ghost) : text}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
