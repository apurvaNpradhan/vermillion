import { Pressable, Text } from "react-native";

/**
 * One cell of the set grid: a pressable, never a text input (the keypad types into it). It shows
 * the value, or a muted Ghost value when empty, or a dash. While being edited it has the focus
 * ring. A refused tick gives the cell a danger outline.
 */
export function SetCell({
  text,
  done = false,
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
  done?: boolean;
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
  const border = refused ? "border-danger" : active ? "border-focus-ring" : "border-transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: empty ? (ghost === "" ? undefined : ghost) : text }}
      disabled={disabled}
      onPress={onPress}
      className={`h-10 min-w-0 flex-1 flex-row items-center justify-center rounded-lg border px-1 active:bg-default ${border} ${done ? "bg-transparent" : active ? "bg-default" : "bg-field"}`}
    >
      {children ?? (
        <Text
          numberOfLines={1}
          className={`font-normal text-center text-body ${empty ? "text-muted" : done ? "text-set-done-soft-foreground" : "text-foreground"}`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {empty ? (ghost === "" ? "–" : ghost) : text}
        </Text>
      )}
    </Pressable>
  );
}
