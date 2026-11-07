import type { AnyFieldApi } from "@tanstack/react-form";
import { Description, FieldError, Input, Label, TextField as HeroTextField } from "heroui-native";
import type { ComponentProps } from "react";
import { z } from "zod";

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
  onSubmitEditing?: () => void;
} & Pick<
  ComponentProps<typeof Input>,
  | "autoCapitalize"
  | "autoComplete"
  | "keyboardType"
  | "secureTextEntry"
  | "textContentType"
  | "returnKeyType"
  | "editable"
>;

/** A labelled input bound to a TanStack Form field, showing its first error. */
export function TextField({ field, label, description, ...input }: Props) {
  const message = firstMessage(field.state.meta.errors);
  const invalid = field.state.meta.isTouched && message !== undefined;
  return (
    <HeroTextField isInvalid={invalid}>
      <Label>{label}</Label>
      <Input
        {...input}
        value={String(field.state.value ?? "")}
        onBlur={field.handleBlur}
        onChangeText={field.handleChange}
      />
      {description ? <Description>{description}</Description> : null}
      <FieldError>{message}</FieldError>
    </HeroTextField>
  );
}
