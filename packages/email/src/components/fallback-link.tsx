/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Text } from "@react-email/components";

import { colors, px, type } from "../theme/tokens";

/** The action URL in plain view, for clients that strip buttons. */
export function FallbackLink({ label, href }: { label: string; href: string }) {
  return (
    <>
      <Text className="m-muted" style={labelStyle}>
        {label}
      </Text>
      <Text style={linkWrapper}>
        <Link href={href} className="m-link" style={link}>
          {href}
        </Link>
      </Text>
    </>
  );
}

const labelStyle = {
  margin: "20px 0 2px",
  color: colors.textMuted,
  fontSize: px(type.caption.size),
  lineHeight: px(type.caption.lineHeight),
};

const linkWrapper = {
  margin: 0,
  fontSize: px(type.caption.size),
  lineHeight: px(type.caption.lineHeight),
  wordBreak: "break-all" as const,
};

const link = { color: colors.textPrimary, textDecoration: "underline" };
