import { useRouter } from "expo-router";
import { Alert as HeroAlert } from "heroui-native";
import { View } from "react-native";
import { useTranslation } from "@/platform/i18n";

import { OtherAccountNotice } from "./other-account-notice";
import { useSyncStatus } from "./use-sync-status";
import { Button } from "@/platform/ui/button";

/**
 * Minimal sync state for the signed-in app (phase 6 refines it): nothing while all is well; a
 * line when sign-in is needed, another account holds the device, or the app is too old.
 */
export function SyncBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { snapshot } = useSyncStatus();
  if (!snapshot) return null;

  if (snapshot.indicator === "update-required") {
    return (
      <HeroAlert status="warning">
        <HeroAlert.Indicator />
        <HeroAlert.Content>
          <HeroAlert.Description>{t("sync__update_required")}</HeroAlert.Description>
        </HeroAlert.Content>
      </HeroAlert>
    );
  }

  if (snapshot.lockReason === "signed-out") {
    return (
      <HeroAlert status="warning">
        <HeroAlert.Indicator />
        <HeroAlert.Content>
          <HeroAlert.Description>
            {t("sync__sign_in_to_sync")}
            {snapshot.pendingCount > 0
              ? ` ${t("sync__pending", { count: snapshot.pendingCount })}`
              : ""}
          </HeroAlert.Description>
          <View className="mt-2 flex-row">
            <Button
              size="sm"
              onPress={() => router.push({ pathname: "/", params: { sheet: "email" } })}
            >
              <Button.Label>{t("sync__sign_in")}</Button.Label>
            </Button>
          </View>
        </HeroAlert.Content>
      </HeroAlert>
    );
  }

  if (snapshot.lockReason === "other-account") return <OtherAccountNotice />;

  return null;
}
