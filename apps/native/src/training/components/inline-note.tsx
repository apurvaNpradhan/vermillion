import { useEffect, useState } from "react";
import { TextInput } from "react-native";

/**
 * A borderless, growing note on a sheet (ui.md allows a bare `TextInput` for this). What is typed
 * is kept locally and reported on every change; an empty note is `null`. The text follows the
 * stored value while the field is not focused.
 */
export function InlineNote({
  value,
  onText,
  placeholder,
  label,
  maxLength,
}: {
  value: string | null;
  onText: (text: string | null) => void;
  placeholder: string;
  label: string;
  maxLength: number;
}) {
  const [text, setText] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ?? "");
  }, [value, focused]);
  return (
    <TextInput
      value={text}
      multiline
      scrollEnabled={false}
      maxLength={maxLength}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-muted"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChangeText={(next) => {
        setText(next);
        onText(next.trim() === "" ? null : next);
      }}
      className="min-h-11 py-2 text-body text-foreground"
    />
  );
}
