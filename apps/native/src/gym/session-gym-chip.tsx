import { CaretDown, Check, MapPin } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";

import { useGyms } from "./use-gyms";

/**
 * "@ Gym ▾": where this Session is trained, in its header, to change it. Only with two gyms or
 * more; with one there is nothing to choose. Choosing a gym also makes it the active gym, since
 * the chip is editable only while the Session is live.
 */
export function SessionGymChip({
  sessionId,
  gymId,
  readOnly,
}: {
  sessionId: string;
  gymId: string | null;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const { gyms, multiple, setForSession, select } = useGyms();
  const [open, setOpen] = useState(false);
  const current = gyms.find((gym) => gym.id === gymId);
  if (!multiple) return null;
  if (readOnly)
    return current ? (
      <Text className="text-caption text-muted">{t("gym__at", { gym: current.name })}</Text>
    ) : null;
  const name = current?.name ?? t("gym__any");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("gym__change_for_workout", { gym: name })}
        onPress={() => setOpen(true)}
        hitSlop={8}
        className="min-h-11 flex-row items-center gap-1 self-start active:opacity-70"
      >
        <Text className="text-caption text-muted" numberOfLines={1}>
          {t("gym__chip", { gym: name })}
        </Text>
        <CaretDown size={12} color={subtle} />
      </Pressable>
      <ActionSheet
        title={t("gym__pick_title")}
        isOpen={open}
        onOpenChange={setOpen}
        actions={[
          ...gyms.map((gym) => ({
            key: gym.id,
            label: gym.name,
            icon: gym.id === gymId ? Check : MapPin,
            onPress: () => {
              void setForSession(sessionId, gym.id);
              // The chip is only editable in the live Session: you are at that gym now.
              select(gym.id);
            },
          })),
          {
            key: "any",
            label: t("gym__any"),
            icon: gymId === null ? Check : MapPin,
            onPress: () => void setForSession(sessionId, null),
          },
        ]}
      />
    </>
  );
}
