/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { colors, px, type } from "../theme/tokens";

/** A short aside under the card, such as "Didn't ask for this?". */
export function EmailNote({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div style={wrapper}>
      {title ? (
        <Heading as="h2" className="m-text" style={heading}>
          {title}
        </Heading>
      ) : null}
      <Text className="m-secondary" style={body}>
        {children}
      </Text>
    </div>
  );
}

const wrapper = { margin: "24px 4px 0" };

const heading = {
  margin: "0 0 4px",
  color: colors.textPrimary,
  fontSize: px(type.label.size),
  lineHeight: px(type.body.lineHeight),
  fontWeight: 600,
};

const body = {
  margin: 0,
  color: colors.textSecondary,
  fontSize: px(type.label.size),
  lineHeight: px(type.body.lineHeight),
};
