import { Pressable, Text, View } from "react-native";

/**
 * One cell of the set grid: a pressable, never a text input (the keypad types into it). It shows
 * the value in full ink, or the Ghost value in faint ink when empty, or a dash. There is no box:
 * the cell being edited has a 2px accent underline, and a refused tick underlines the cell in danger.
 */
export function SetCell({
  text,
  ghost,
  active,
  refused,
  label,
  onPress,
  disabled,
  children,
}: {
  /** The value as text; empty when the cell has none. */
  text: string;
  /** The Ghost value as text, shown muted when `text` is empty. */
  ghost: string;
  active: boolean;
  refused: boolean;
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
      {children ?? (
        <View className="items-center">
          <Text
            numberOfLines={1}
            className={`font-normal text-center text-body ${empty ? "text-muted" : "text-foreground"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {empty ? (ghost === "" ? "–" : ghost) : text}
          </Text>
          <View className={`h-[2px] min-w-6 self-stretch rounded-full ${bar}`} />
        </View>
      )}
    </Pressable>
  );
}
