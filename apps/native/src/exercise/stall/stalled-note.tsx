import { X } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import { changeStall } from "./stall-store";

/**
 * One quiet line under an exercise's header: "Stalled for 3 sessions. Try 90% today." Tapping it
 * applies the deload (suggestions only, never a tick or a typed value); the cross hides it until
 * the exercise has a new Session. Never a modal, never blocking.
 */
export function StalledNote({
  exerciseId,
  latestSessionId,
  count,
  applied,
}: {
  exerciseId: string;
  latestSessionId: string;
  count: number;
  applied: boolean;
}) {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t("stall__apply_hint")}
        onPress={() => {
          haptic.tick();
          changeStall(exerciseId, latestSessionId, { applied: !applied });
        }}
        className="min-h-11 flex-1 justify-center"
      >
        <Text className="font-normal text-caption text-muted">
          {applied ? t("stall__applied") : t("stall__note", { count })}
          {applied ? <Text className="text-foreground">{` ${t("stall__undo")}`}</Text> : null}
        </Text>
      </Pressable>
      {applied ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stall__dismiss")}
          hitSlop={8}
          onPress={() => changeStall(exerciseId, latestSessionId, { dismissed: true })}
          className="h-11 w-11 items-center justify-center"
        >
          <X size={20} color={muted} />
        </Pressable>
      )}
    </View>
  );
}
