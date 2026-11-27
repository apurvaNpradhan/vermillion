import { Check, MapPin } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";

import type { useGyms } from "./use-gyms";

/**
 * The gym picker of the live Session, opened from its menu item "Gym: <name>". Choosing a gym also
 * makes it the active gym; "Any gym" leaves the active gym as it was.
 */
export function SessionGymPicker({
  sessionId,
  gymId,
  isOpen,
  onOpenChange,
  gyms,
  setForSession,
}: {
  sessionId: string;
  gymId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  gyms: ReturnType<typeof useGyms>["gyms"];
  setForSession: ReturnType<typeof useGyms>["setForSession"];
}) {
  const { t } = useTranslation();
  return (
    <ActionSheet
      title={t("gym__pick_title")}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      actions={[
        ...gyms.map((gym) => ({
          key: gym.id,
          label: gym.name,
          icon: gym.id === gymId ? Check : MapPin,
          onPress: () => void setForSession(sessionId, gym.id),
        })),
        {
          key: "any",
          label: t("gym__any"),
          icon: gymId === null ? Check : MapPin,
          onPress: () => void setForSession(sessionId, null),
        },
      ]}
    />
  );
}
