/** @jsxRuntime automatic @jsxImportSource react */
import { Section as EmailSection } from "@react-email/components";
import type { ComponentProps } from "react";

/** A full-width table section; email clients size tables by their content unless told otherwise. */
export function Section({ style, ...props }: ComponentProps<typeof EmailSection>) {
  return <EmailSection {...props} style={{ width: "100%", ...style }} />;
}
