/** @jsxRuntime automatic @jsxImportSource react */
import type { ReactNode } from "react";

import { colors, px, radius } from "../theme/tokens";
import { Section } from "./section";

/** The card: flat `surface` with a 1px hairline and the card radius. No shadow. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <Section className="m-card" style={frame}>
      {children}
    </Section>
  );
}

const frame = {
  backgroundColor: colors.surface,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: colors.hairline,
  borderRadius: px(radius.card),
  padding: "28px 24px",
};
