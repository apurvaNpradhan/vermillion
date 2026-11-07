import type { AnyFieldApi } from "@tanstack/react-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
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
} & Pick<ComponentProps<typeof Input>, "type" | "autoComplete" | "placeholder" | "inputMode">;

/** A labelled input bound to a TanStack Form field, showing its first error. */
export function TextField({ field, label, description, ...input }: Props) {
  const message = firstMessage(field.state.meta.errors);
  const invalid = field.state.meta.isTouched && message !== undefined;
  return (
    <Field invalid={invalid} name={field.name}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        {...input}
        value={String(field.state.value ?? "")}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError match={invalid}>{message}</FieldError>
    </Field>
  );
}
