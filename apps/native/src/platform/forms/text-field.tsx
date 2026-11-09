import type { AnyFieldApi } from "@tanstack/react-form";
import { z } from "zod";

import { Field, type FieldProps } from "@/platform/ui/field";

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

type Props = Omit<FieldProps, "value" | "onChangeText" | "onBlur" | "error"> & {
  field: AnyFieldApi;
};

/** A `Field` bound to a TanStack Form field, showing its first error once touched. */
export function TextField({ field, ...input }: Props) {
  const message = firstMessage(field.state.meta.errors);
  return (
    <Field
      {...input}
      value={String(field.state.value ?? "")}
      onChangeText={field.handleChange}
      onBlur={field.handleBlur}
      error={field.state.meta.isTouched ? message : undefined}
    />
  );
}
