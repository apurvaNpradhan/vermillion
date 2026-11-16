import { View, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

/**
 * Another device owns this Session, so it is read-only here. A device that had it and lost it
 * says "Continued on another device"; one that never had it says "In progress on another device".
 */
export function OwnershipBanner({ lost, onTakeOver }: { lost: boolean; onTakeOver: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="mx-3 mt-3 gap-3 rounded-2xl bg-surface p-4">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-semibold text-body text-foreground">
          {t(lost ? "session__continued_elsewhere" : "session__in_progress_elsewhere")}
        </Text>
        <Text className="text-caption text-muted">{t("session__read_only_hint")}</Text>
      </View>
      <Button variant="primary" onPress={onTakeOver}>
        <Button.Label>{t("session__take_over")}</Button.Label>
      </Button>
    </View>
  );
}
