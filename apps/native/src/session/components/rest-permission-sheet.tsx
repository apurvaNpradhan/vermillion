import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { SheetShell } from "./sheet-shell";

/**
 * The one-line explanation shown before the system permission dialog, the first time a Rest
 * starts: "Get a buzz when rest is over". Turning it on opens the system dialog; either answer is
 * remembered, and Settings → Training can change it later.
 */
export function RestPermissionSheet({
  isOpen,
  onOpenChange,
  onAllow,
  onDecline,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAllow: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SheetShell
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onDecline();
        onOpenChange(open);
      }}
      title={t("session__rest_permission_title")}
    >
      <View className="gap-2">
        <Button variant="primary" onPress={onAllow}>
          <Button.Label>{t("session__rest_permission_allow")}</Button.Label>
        </Button>
        <Button variant="secondary" onPress={onDecline}>
          <Button.Label>{t("session__rest_permission_decline")}</Button.Label>
        </Button>
      </View>
    </SheetShell>
  );
}
