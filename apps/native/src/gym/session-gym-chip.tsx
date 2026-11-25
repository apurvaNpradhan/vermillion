import { CaretDown, Check, MapPin } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";

import { useGyms } from "./use-gyms";
import { useSessionGym } from "./use-session-gym";

/**
 * "@ Gym ▾": where this Session is trained, in its header, to change it. Only with two gyms or
 * more; with one there is nothing to choose.
 */
export function SessionGymChip({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const { gyms, multiple, setForSession } = useGyms();
  const gymId = useSessionGym(sessionId);
  const [open, setOpen] = useState(false);
  const current = gyms.find((gym) => gym.id === gymId);
  if (!multiple) return null;
  const name = current?.name ?? t("gym__any");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("gym__change_for_workout", { gym: name })}
        disabled={readOnly}
        onPress={() => setOpen(true)}
        hitSlop={8}
        className="flex-row items-center gap-1 self-start py-0.5 active:opacity-70"
      >
        <Text className="text-caption text-muted" numberOfLines={1}>
          {t("gym__chip", { gym: name })}
        </Text>
        {readOnly ? null : <CaretDown size={12} color={subtle} />}
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
    </>
  );
}
