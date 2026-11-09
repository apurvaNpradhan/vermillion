/** @jsxRuntime automatic @jsxImportSource react */
import { Button } from "@react-email/components";
import type { ReactNode } from "react";

import { colors, fontFamily, px, radius, type } from "../theme/tokens";

/** The primary action: `action` fill, `on-action` text. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button href={href} className="m-btn" style={button}>
      {children}
    </Button>
  );
}

const button = {
  display: "inline-block",
  backgroundColor: colors.action,
  color: colors.onAction,
  border: `1px solid ${colors.action}`,
  borderRadius: px(radius.control),
  padding: "12px 20px",
  fontFamily,
  fontSize: px(type.body.size),
  lineHeight: px(type.body.lineHeight),
  fontWeight: 500,
  textDecoration: "none",
};
