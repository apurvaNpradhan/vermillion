import { Check, MapPin } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";

import { useGyms } from "./use-gyms";

/**
 * The Session's gym as the header and the Session menu need it. With one gym nothing about gyms
 * shows: `multiple` is false and `name` is null. `name` is also null for "Any gym" in the header.
 */
export function useSessionGymLabel(gymId: string | null) {
  const { gyms, multiple } = useGyms();
  const current = gyms.find((gym) => gym.id === gymId);
  return { multiple, name: multiple ? (current?.name ?? null) : null };
}

/**
 * The gym picker of the live Session, opened from its menu item "Gym: <name>". Choosing a gym also
 * makes it the active gym; "Any gym" leaves the active gym as it was.
 */
export function SessionGymPicker({
  sessionId,
  gymId,
  isOpen,
  onOpenChange,
}: {
  sessionId: string;
  gymId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { gyms, setForSession } = useGyms();
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
