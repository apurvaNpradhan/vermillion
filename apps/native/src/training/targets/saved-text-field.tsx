import { useEffect, useState } from "react";

import { Field, type FieldProps } from "@/platform/ui/field";

/**
 * A text field that edits a nullable stored string: what is typed is kept locally and `onText`
 * is called on every change (the screen's writer coalesces the writes). An empty field is `null`.
 * The text follows the stored value while the field is not focused.
 */
export function SavedTextField({
  value,
  onText,
  ...field
}: Omit<FieldProps, "value" | "onChangeText"> & {
  value: string | null;
  onText: (text: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ?? "");
  }, [value, focused]);
  return (
    <Field
      {...field}
      value={text}
      onFocus={(event) => {
        setFocused(true);
        field.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        field.onBlur?.(event);
      }}
      onChangeText={(next) => {
        setText(next);
        onText(next.trim() === "" ? null : next);
      }}
    />
  );
}
