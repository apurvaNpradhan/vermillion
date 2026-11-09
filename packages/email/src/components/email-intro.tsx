/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from "@react-email/components";

import { colors, px, type } from "../theme/tokens";

export function EmailIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <Heading as="h1" className="m-text" style={heading}>
        {title}
      </Heading>
      {subtitle ? (
        <Text className="m-secondary" style={subtitleText}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

const heading = {
  margin: "0 0 8px",
  color: colors.textPrimary,
  fontSize: px(type["title-lg"].size),
  lineHeight: px(type["title-lg"].lineHeight),
  fontWeight: type["title-lg"].weight,
  letterSpacing: px(type["title-lg"].tracking),
};

const subtitleText = {
  margin: "0 0 24px",
  color: colors.textSecondary,
  fontSize: px(type.body.size),
  lineHeight: px(type.body.lineHeight),
};
