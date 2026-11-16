import { useBottomSheetAwareHandlers } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, TextInput } from "react-native";

/**
 * A compact numeric input for a table cell. It keeps what is being typed; `parse` turns the text
 * into a value (`undefined` for empty, `null` for text that is not a value yet, such as "4."), and
 * a value is reported as it becomes valid. When the stored value changes elsewhere, or the field
 * loses focus with text that was never accepted, the text follows the stored value.
 */
export function CellInput({
  value,
  parse,
  format,
  onValue,
  label,
  decimal = false,
  placeholder = "–",
}: {
  value: number | undefined;
  parse: (text: string) => number | undefined | null;
  format: (value: number) => string;
  onValue: (value: number | undefined) => void;
  /** What the cell is, for screen readers ("Set 2 weight"). */
  label: string;
  decimal?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : format(value));
  const [focused, setFocused] = useState(false);
  const sheetKeyboard = useBottomSheetAwareHandlers();
  useEffect(() => {
    if (!focused) setText(value === undefined ? "" : format(value));
  }, [value, focused, format]);

  return (
    <TextInput
      value={text}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-muted"
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
      returnKeyType="done"
      onSubmitEditing={() => Keyboard.dismiss()}
      selectTextOnFocus
      onFocus={(event) => {
        sheetKeyboard.onFocus(event);
        setFocused(true);
      }}
      onBlur={(event) => {
        sheetKeyboard.onBlur(event);
        setFocused(false);
      }}
      onChangeText={(next) => {
        setText(next);
        const parsed = parse(next);
        if (parsed !== null) onValue(parsed);
      }}
      className={`h-10 min-w-0 flex-1 rounded-lg px-1 text-center text-body text-foreground ${
        focused ? "border border-focus-ring bg-field" : "border border-transparent bg-field"
      }`}
      style={{ fontVariant: ["tabular-nums"] }}
    />
  );
}
