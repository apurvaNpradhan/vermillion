import { Alert } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";

/**
 * Signing out with unsent changes asks first (ADR 0021). The changes stay on the device either
 * way and upload when the same account signs in again; the prompt says so.
 */
export function useSignOutConfirmation(signOut: () => void) {
  const { t } = useTranslation();
  const { countUnsent } = useSyncStatus();
  return async () => {
    const count = await countUnsent();
    if (count === 0) {
      signOut();
      return;
    }
    Alert.alert(t("sync__sign_out_title"), t("sync__sign_out_body", { count }), [
      { text: t("common__cancel"), style: "cancel" },
      { text: t("nav__sign_out"), onPress: signOut },
    ]);
  };
}
