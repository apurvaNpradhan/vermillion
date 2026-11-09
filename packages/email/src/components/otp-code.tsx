/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "@react-email/components";

import { colors, monoFamily, fontFamily, px, radius, type } from "../theme/tokens";
import { Section } from "./section";

/**
 * The code, large and tabular on a `surface-control` box. One text node, so it can be selected and
 * copied whole, and the plain-text version contains it unbroken.
 */
export function OtpCode({ code, hint }: { code: string; hint: string }) {
  return (
    <Section style={wrapper}>
      <div className="m-code" style={box}>
        {code}
      </div>
      <Text className="m-muted" style={hintStyle}>
        {hint}
      </Text>
    </Section>
  );
}

const wrapper = { margin: "0 0 8px" };

const box = {
  backgroundColor: colors.control,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: colors.hairline,
  borderRadius: px(radius.control),
  color: colors.textPrimary,
  fontFamily: `${fontFamily}, ${monoFamily}`,
  fontVariantNumeric: "tabular-nums",
  fontSize: px(type["numeric-xl"].size),
  lineHeight: px(type["numeric-xl"].lineHeight),
  fontWeight: type["numeric-xl"].weight,
  letterSpacing: "0.3em",
  // The left padding balances the trailing letter space so the digits sit centred.
  padding: "16px 0 16px 0.3em",
  textAlign: "center" as const,
};

const hintStyle = {
  margin: "12px 0 0",
  color: colors.textMuted,
  fontSize: px(type.label.size),
  lineHeight: px(type.label.lineHeight),
};
