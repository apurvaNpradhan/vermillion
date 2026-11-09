import { useRouter } from "expo-router";
import { Alert as HeroAlert } from "heroui-native";
import { Alert, View } from "react-native";

import { useSignOut } from "@/auth";
import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";
import { Button } from "@/platform/ui/button";

/**
 * Minimal sync state for the signed-in app (phase 6 refines it): nothing while all is well; a
 * line when sign-in is needed, another account holds the device, or the app is too old.
 */
export function SyncBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const { snapshot, countUnsent, discardAndSwitch } = useSyncStatus();
  if (!snapshot) return null;

  async function confirmDiscard() {
    const count = await countUnsent();
    Alert.alert(t("sync__discard_title"), t("sync__discard_body", { count }), [
      { text: t("common__cancel"), style: "cancel" },
      {
        text: t("sync__discard_confirm"),
        style: "destructive",
        onPress: () => void discardAndSwitch(),
      },
    ]);
  }

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
            <Button size="sm" onPress={() => router.push("/email")}>
              <Button.Label>{t("sync__sign_in")}</Button.Label>
            </Button>
          </View>
        </HeroAlert.Content>
      </HeroAlert>
    );
  }

  if (snapshot.lockReason === "other-account") {
    return (
      <HeroAlert status="danger">
        <HeroAlert.Indicator />
        <HeroAlert.Content>
          <HeroAlert.Description>{t("sync__other_account")}</HeroAlert.Description>
          <View className="mt-2 flex-row gap-2">
            <Button size="sm" onPress={() => signOut.mutate()}>
              <Button.Label>{t("sync__switch_back")}</Button.Label>
            </Button>
            <Button size="sm" variant="danger-soft" onPress={() => void confirmDiscard()}>
              <Button.Label>{t("sync__discard")}</Button.Label>
            </Button>
          </View>
        </HeroAlert.Content>
      </HeroAlert>
    );
  }

  return null;
}
