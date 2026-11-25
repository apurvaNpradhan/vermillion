import { useRouter } from "expo-router";
import { Barbell, PencilSimple, Trash } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

import { EquipmentHereSection } from "./equipment-here-section";
import { GymNameSheet } from "./gym-name-sheet";
import { useGyms } from "./use-gyms";

/**
 * One gym: use it, rename it, open its kit, delete it.
 */
export function GymScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { gyms, activeGymId, select, rename, remove, ready } = useGyms();
  const gym = gyms.find((entry) => entry.id === id);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const last = gyms.length <= 1;
  if (ready && !gym) return null;
  return (
    <>
      <ScrollPage title={gym?.name ?? ""} back backFallback="/settings/gyms">
        <ListSection>
          <ListRow
            icon={Barbell}
            title={t("gym__equipment")}
            onPress={() => router.push({ pathname: "/settings/plates", params: { gymId: id } })}
          />
          <ListRow
            icon={Barbell}
            title={id === activeGymId ? t("gym__in_use") : t("gym__use")}
            accessory="none"
            disabled={id === activeGymId}
            onPress={() => select(id)}
          />
          <ListRow
            icon={PencilSimple}
            title={t("gym__rename")}
            accessory="none"
            onPress={() => setRenaming(true)}
          />
        </ListSection>
        <EquipmentHereSection gymId={id} />
        <ListSection>
          <ListRow
            icon={Trash}
            tone="danger"
            title={t("gym__delete")}
            description={last ? t("gym__last") : undefined}
            accessory="none"
            disabled={last}
            onPress={() => setConfirming(true)}
          />
        </ListSection>
      </ScrollPage>
      <GymNameSheet
        isOpen={renaming}
        onOpenChange={setRenaming}
        title={t("gym__rename")}
        value={gym?.name ?? ""}
        confirmLabel={t("common__save")}
        onSave={async (name) => (await rename(id, name)) === true}
      />
      <ConfirmationDialog
        destructive
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t("gym__delete_title", { name: gym?.name ?? "" })}
        description={t("gym__delete_body")}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("gym__delete")}
        onConfirm={() => {
          void remove(id).then((done) => {
            if (!done) return;
            if (gyms.length === 2) router.dismissTo("/settings");
            else if (router.canGoBack()) router.back();
            else router.replace("/settings/gyms");
          });
        }}
      />
    </>
  );
}
