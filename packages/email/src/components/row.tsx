/** @jsxRuntime automatic @jsxImportSource react */
import { Row as EmailRow } from "@react-email/components";
import type { ComponentProps } from "react";

export function Row({ style, ...props }: ComponentProps<typeof EmailRow>) {
  return <EmailRow {...props} style={{ width: "100%", ...style }} />;
}
