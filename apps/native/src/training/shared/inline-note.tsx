import { useEffect, useState, type Ref } from "react";
import { TextInput } from "react-native";

/**
 * A borderless, growing note on a sheet (ui.md allows a bare `TextInput` for this). What is typed
 * is kept locally and reported on every change; an empty note is `null`. The text follows the
 * stored value while the field is not focused.
 */
export function InlineNote({
  value,
  inputRef,
  onText,
  placeholder,
  label,
  maxLength,
  onDone,
  autoFocus = false,
}: {
  value: string | null;
  inputRef?: Ref<TextInput>;
  onText: (text: string | null) => void;
  placeholder: string;
  label: string;
  maxLength: number;
  /** Called when the field loses focus, for callers that save once editing ends. */
  onDone?: () => void;
  /** Focus the field when it appears (a note that was just opened). */
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ?? "");
  }, [value, focused]);
  return (
    <TextInput
      ref={inputRef}
      value={text}
      multiline
      autoFocus={autoFocus}
      scrollEnabled={false}
      maxLength={maxLength}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-muted"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onDone?.();
      }}
      onChangeText={(next) => {
        setText(next);
        onText(next.trim() === "" ? null : next);
      }}
      className="font-normal min-h-11 py-2 text-body text-foreground"
    />
  );
}
