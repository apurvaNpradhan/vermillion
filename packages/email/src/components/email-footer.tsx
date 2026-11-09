/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "@react-email/components";

import { colors, px, type } from "../theme/tokens";

export function EmailFooter({ reason }: { reason: string }) {
  return (
    <Text className="m-muted" style={footer}>
      {reason}
    </Text>
  );
}

const footer = {
  margin: "16px 4px 0",
  color: colors.textMuted,
  fontSize: px(type.caption.size),
  lineHeight: px(type.caption.lineHeight),
};
