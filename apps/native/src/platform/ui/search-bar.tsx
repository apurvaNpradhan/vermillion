/**
 * Source: PanelUI (panelui-native 1.2.0), `SearchBar`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: reduced to the field, clear button and optional Cancel (no results panel, debounce,
 * keyboard avoidance or loading state; screens own those). bg-field, radius 12, 44pt tall,
 * Phosphor icons, all text through props.
 */
import { useThemeColor } from "heroui-native";
import { MagnifyingGlass, XCircle } from "phosphor-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (text: string) => void;
  placeholder: string;
  /** Accessible name of the field; falls back to `placeholder`. */
  accessibilityLabel?: string;
  /** Accessible name of the clear button (translated). */
  clearLabel: string;
  /** Shows a Cancel button beside the field while it is focused. Pressing it clears and blurs. */
  cancelLabel?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
};

/** A 44pt search field: magnifier, clear button once there is a query, optional Cancel. */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  clearLabel,
  cancelLabel,
  onCancel,
  autoFocus,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inner = useRef<TextInput | null>(null);
  const muted = useThemeColor("muted");

  return (
    <View className="flex-row items-center gap-3">
      <View
        className={`h-11 flex-1 flex-row items-center gap-2 rounded-xl border bg-field px-3 ${
          focused ? "border-focus-ring" : "border-transparent"
        }`}
      >
        <MagnifyingGlass size={18} color={muted} />
        <TextInput
          ref={inner}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={() => onSubmit?.(value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColorClassName="accent-muted"
          accessibilityLabel={accessibilityLabel ?? placeholder}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          className="h-11 flex-1 text-body text-foreground"
        />
        {value.length > 0 ? (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
              hitSlop={12}
              onPress={() => {
                onChangeText("");
                inner.current?.focus();
              }}
            >
              <XCircle size={18} weight="fill" color={muted} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
      {cancelLabel && focused ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              onChangeText("");
              inner.current?.blur();
              onCancel?.();
            }}
          >
            <Text className="text-body text-subtle">{cancelLabel}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}
