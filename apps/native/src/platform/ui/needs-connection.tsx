import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useIsOnline } from "@/platform/network";

/**
 * The caption under an action that truly needs the server (sign-in, changing the email, deleting
 * the account): shown only while the device cannot reach it. The action itself is disabled with
 * the same `useIsOnline`, so offline it reads as unavailable, never as a spinner or an error.
 */
export function NeedsConnection({ className }: { className?: string }) {
  const { t } = useTranslation();
  const online = useIsOnline();
  if (online) return null;
  return (
    <Text accessibilityRole="text" className={className ?? "text-caption text-muted"}>
      {t("common__needs_connection")}
    </Text>
  );
}
