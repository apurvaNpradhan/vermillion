import { useEffect, useState } from "react";
import { Text } from "react-native";

import { Field } from "@/platform/ui/field";

/**
 * A numeric text field that keeps what is being typed. `parse` turns the text into a value
 * (`undefined` for empty, `null` for text that is not a value yet, such as "4."); a value
 * is reported as it becomes valid. When the stored value changes from elsewhere and the field is
 * not focused, the text follows it.
 */
export function NumberField({
  label,
  value,
  parse,
  format,
  onValue,
  unit,
  decimal = false,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  parse: (text: string) => number | undefined | null;
  format: (value: number) => string;
  onValue: (value: number | undefined) => void;
  /** A short unit shown after the number ("kg"). */
  unit?: string;
  decimal?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? "" : format(value));
  }, [value, focused, format]);

  return (
    <Field
      label={label}
      value={text}
      placeholder={placeholder}
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
      selectTextOnFocus
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChangeText={(next) => {
        setText(next);
        const parsed = parse(next);
        if (parsed !== null) onValue(parsed);
      }}
      end={unit ? <Text className="text-body text-muted">{unit}</Text> : undefined}
    />
  );
}
