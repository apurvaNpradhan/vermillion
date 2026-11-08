import type { AnyFieldApi } from "@tanstack/react-form";
import {
  Description,
  FieldError,
  InputGroup,
  Label,
  TextField as HeroTextField,
  useThemeColor,
} from "heroui-native";
import { Eye, EyeSlash, type IconProps } from "phosphor-react-native";
import { useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";

import { useTranslation } from "@/platform/i18n";

const errorMessage = z.union([
  z.string(),
  z.object({ message: z.string() }).transform((e) => e.message),
]);

function firstMessage(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    const parsed = errorMessage.safeParse(error);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

type Props = {
  field: AnyFieldApi;
  label: string;
  description?: string;
  /** A Phosphor icon at the start of the field. */
  icon?: ComponentType<IconProps>;
  /** Shown on the label's row, at its end (a "Forgot password?" link). */
  labelAccessory?: ReactNode;
  onSubmitEditing?: () => void;
} & Pick<
  ComponentProps<typeof InputGroup.Input>,
  | "autoCapitalize"
  | "autoComplete"
  | "keyboardType"
  | "secureTextEntry"
  | "textContentType"
  | "returnKeyType"
  | "editable"
  | "placeholder"
>;

/**
 * A labelled input bound to a TanStack Form field, showing its first error. 52pt tall on
 * `surface-control`, an optional leading icon, and a show/hide toggle on password fields.
 */
export function TextField({
  field,
  label,
  description,
  icon: Icon,
  labelAccessory,
  secureTextEntry,
  ...input
}: Props) {
  const { t } = useTranslation();
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const [revealed, setRevealed] = useState(false);
  const message = firstMessage(field.state.meta.errors);
  const invalid = field.state.meta.isTouched && message !== undefined;
  return (
    <HeroTextField isInvalid={invalid}>
      <View className="flex-row items-center justify-between">
        <Label>{label}</Label>
        {labelAccessory}
      </View>
      <InputGroup>
        {Icon ? (
          <InputGroup.Prefix isDecorative className="pl-4">
            <Icon size={18} color={muted} />
          </InputGroup.Prefix>
        ) : null}
        <InputGroup.Input
          {...input}
          secureTextEntry={secureTextEntry && !revealed}
          placeholderTextColor={muted}
          className="h-13 rounded-xl text-body"
          value={String(field.state.value ?? "")}
          onBlur={field.handleBlur}
          onChangeText={field.handleChange}
        />
        {secureTextEntry ? (
          <InputGroup.Suffix className="pr-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? t("auth__hide_password") : t("auth__show_password")}
              onPress={() => setRevealed((value) => !value)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-default"
            >
              {revealed ? (
                <EyeSlash size={18} color={foreground} />
              ) : (
                <Eye size={18} color={muted} />
              )}
            </Pressable>
          </InputGroup.Suffix>
        ) : null}
      </InputGroup>
      {description ? <Description>{description}</Description> : null}
      <FieldError>{message}</FieldError>
    </HeroTextField>
  );
}
