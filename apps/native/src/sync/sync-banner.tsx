import { useRouter } from "expo-router";
import { Alert as HeroAlert } from "heroui-native";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";

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
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const lockReason = snapshot?.lockReason ?? null;
  // Each lock gets its own prompt: a count that lands after the lock changed is ignored, and a
  // prompt left open when the lock clears does not come back with a stale count later.
  const lockGeneration = useRef(0);
  useEffect(() => {
    lockGeneration.current += 1;
    setDiscardCount(null);
  }, [lockReason]);
  if (!snapshot) return null;

  async function confirmDiscard() {
    const generation = lockGeneration.current;
    const count = await countUnsent();
    if (generation === lockGeneration.current) setDiscardCount(count);
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

  if (snapshot.lockReason === "other-account") {
    return (
      <>
        <ConfirmationDialog
          isOpen={discardCount !== null}
          onOpenChange={(open) => {
            if (!open) setDiscardCount(null);
          }}
          title={t("sync__discard_title")}
          description={t("sync__discard_body", { count: discardCount ?? 0 })}
          cancelLabel={t("common__cancel")}
          confirmLabel={t("sync__discard_confirm")}
          destructive
          onConfirm={() => void discardAndSwitch()}
        />
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
      </>
    );
  }

  return null;
}
