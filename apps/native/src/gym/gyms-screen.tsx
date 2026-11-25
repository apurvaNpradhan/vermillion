import { useRouter } from "expo-router";
import { Plus, Barbell } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

import { GymNameSheet } from "./gym-name-sheet";
import { useGyms } from "./use-gyms";

/** Settings → Gyms: the user's gyms, the one in use marked, and a way to add another. */
export function GymsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { gyms, activeGymId, create } = useGyms();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <ScrollPage title={t("gym__gyms")} back backFallback="/settings">
        <ListSection>
          {gyms.map((gym) => (
            <ListRow
              key={gym.id}
              icon={Barbell}
              title={gym.name}
              value={gym.id === activeGymId ? t("gym__active") : undefined}
              onPress={() => router.push({ pathname: "/settings/gym", params: { id: gym.id } })}
            />
          ))}
          <ListRow
            icon={Plus}
            title={t("gym__add")}
            accessory="none"
            onPress={() => setAdding(true)}
          />
        </ListSection>
      </ScrollPage>
      <GymNameSheet
        isOpen={adding}
        onOpenChange={setAdding}
        title={t("gym__new_title")}
        description={t("gym__new_hint")}
        value=""
        confirmLabel={t("gym__create")}
        onSave={(name) => void create(name)}
      />
    </>
  );
}
