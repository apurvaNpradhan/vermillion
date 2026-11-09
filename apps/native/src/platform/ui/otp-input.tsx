/**
 * Source: PanelUI (panelui-native 1.2.0), `OtpInput`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: Vermillion tokens (bg-field cells, radius 12, border-separator focus, border-danger
 * error), digits only with no native `maxLength` (so spaced pastes survive), `sms-otp` and
 * `one-time-code` autofill per platform, no caret animation or mask/group options, tabular
 * `text-numeric-md`, and pure sanitising moved to `otp-code.ts`.
 */
import { cn } from "heroui-native";
import { Fragment, useRef, useState, type Ref } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { OTP_LENGTH, activeOtpCell, isOtpComplete, sanitizeOtp, startsOtpGroup } from "./otp-code";

export type OtpInputProps = {
  /** The code so far. Controlled: set it to "" to clear after an error. */
  value: string;
  onChangeText: (code: string) => void;
  /** Called once, when the last digit lands (typed, autofilled or pasted). */
  onComplete?: (code: string) => void;
  length?: number;
  /** Cells per group, with a dash between groups (3 for a 6-digit code). Ungrouped when omitted. */
  groupSize?: number;
  /** Danger border on every cell. Clear it and `value` together to retry. */
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** The field's accessible name (translated by the caller). */
  accessibilityLabel: string;
  className?: string;
  ref?: Ref<TextInput>;
};

/**
 * A one-time code as separate cells over one hidden TextInput, so the keyboard, SMS autofill and
 * paste all work on a real input. Tapping anywhere on the row focuses it.
 */
export function OtpInput({
  value,
  onChangeText,
  onComplete,
  length = OTP_LENGTH,
  groupSize,
  error = false,
  disabled = false,
  autoFocus,
  accessibilityLabel,
  className,
  ref,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const code = sanitizeOtp(value, length);
  const active = activeOtpCell(code, length);
  const previous = useRef(code);

  const handleChange = (raw: string) => {
    const next = sanitizeOtp(raw, length);
    const wasComplete = isOtpComplete(previous.current, length);
    previous.current = next;
    onChangeText(next);
    if (!wasComplete && isOtpComplete(next, length)) onComplete?.(next);
  };

  // Keep the guard honest when the parent clears or sets the value itself.
  previous.current = code;

  return (
    <View className={cn("relative w-full", disabled && "opacity-50", className)}>
      <View className="flex-row justify-center gap-2" pointerEvents="none">
        {Array.from({ length }, (_, index) => {
          const char = code[index] ?? "";
          const isActive = focused && !disabled && index === active;
          return (
            <Fragment key={index}>
              {startsOtpGroup(index, groupSize) ? (
                <View className="w-2 items-center justify-center">
                  <View className="h-0.5 w-2 rounded-full bg-border" />
                </View>
              ) : null}
              <View
                className={cn(
                  "h-14 max-w-14 flex-1 items-center justify-center rounded-xl border bg-field",
                  error ? "border-danger" : isActive ? "border-identity" : "border-transparent",
                )}
              >
                <Text className="text-numeric-md font-medium tabular-nums text-foreground">
                  {char}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={code}
        onChangeText={handleChange}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        autoCorrect={false}
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={accessibilityLabel}
        aria-invalid={error}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 opacity-0"
      />
    </View>
  );
}
