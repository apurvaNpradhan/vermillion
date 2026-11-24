import { Alert as HeroAlert } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useSignOut } from "@/auth";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";

import { useSyncStatus } from "./use-sync-status";

/**
 * The choice when another account signed in on a device that holds someone else's data: sign out
 * and switch back, or discard the device's data and switch. Shown by the sync banner and before
 * onboarding, where nothing can be saved until the choice is made.
 */
export function OtherAccountNotice() {
  const { t } = useTranslation();
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

  async function confirmDiscard() {
    const generation = lockGeneration.current;
    const count = await countUnsent();
    if (generation === lockGeneration.current) setDiscardCount(count);
  }

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
