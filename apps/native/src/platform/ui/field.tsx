/**
 * Source: PanelUI (panelui-native 1.2.0), `Field` and `InputGroup`. MIT licence,
 * https://github.com/panel-ui/PanelUI.
 * Changed: collapsed into one component on a plain TextInput (HeroUI Input would add its own
 * chrome that we would then fight); bg-field, radius 12, border-separator focus, danger border
 * and Warning-icon error text; start/end adornments are laid out in a row instead of measured
 * absolute decorators, so text never runs under them. Values flow through value / onChangeText /
 * onBlur for TanStack Form.
 */
import { cn, useThemeColor } from "heroui-native";
import { Warning } from "phosphor-react-native";

import { useState, type ReactNode, type Ref } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

export type FieldProps = Omit<TextInputProps, "style" | "children"> & {
  label?: string;
  description?: string;
  /** Translated message; also puts the field in its error state. */
  error?: string;
  /** Rendered before the text, e.g. an icon. */
  start?: ReactNode;
  /** Rendered after the text, e.g. a unit or a show/hide button. */
  end?: ReactNode;
  disabled?: boolean;
  className?: string;
  ref?: Ref<TextInput>;
};

/** Label, 44pt `bg-field` input with optional adornments, description and error. */
export function Field({
  label,
  description,
  error,
  start,
  end,
  disabled = false,
  className,
  onFocus,
  onBlur,
  multiline,
  ref,
  accessibilityLabel,
  ...input
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const danger = useThemeColor("danger");
  const hasError = error !== undefined && error.length > 0;

  return (
    <View className={cn("gap-1.5", disabled && "opacity-50", className)}>
      {label ? <Text className="text-label font-medium text-foreground">{label}</Text> : null}
      <View
        className={cn(
          "flex-row items-center gap-2 rounded-xl border bg-field px-3",
          multiline ? "min-h-11 items-start py-2.5" : "h-11",
          hasError ? "border-danger" : focused ? "border-focus-ring" : "border-transparent",
        )}
      >
        {start}
        <TextInput
          ref={ref}
          editable={!disabled}
          multiline={multiline}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={description}
          aria-invalid={hasError}
          placeholderTextColorClassName="accent-muted"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className="flex-1 text-body text-foreground"
          {...input}
        />
        {end}
      </View>
      {hasError ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-1.5"
        >
          <Warning size={14} color={danger} weight="fill" />
          <Text className="flex-1 text-caption text-foreground">{error}</Text>
        </View>
      ) : description ? (
        <Text className="text-caption text-muted">{description}</Text>
      ) : null}
    </View>
  );
}
