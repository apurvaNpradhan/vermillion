import { X } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import { dismissStall } from "./stall-store";

/**
 * One quiet line under an exercise's header: "Stalled for 3 sessions. Try lighter loads today." Tapping it
 * applies the deload in an active Session. The cross dismisses the current note.
 */
export function StalledNote({
  exerciseId,
  latestSessionId,
  count,
  applied,
  missed = false,
  onApply,
}: {
  exerciseId: string;
  latestSessionId: string;
  count: number;
  applied: boolean;
  /** The suggestion was missed every time, rather than the numbers standing still. */
  missed?: boolean;
  onApply?: (applied: boolean) => void;
}) {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  const note = applied
    ? t("stall__applied_with_undo")
    : t(missed ? "stall__note_missed" : "stall__note", { count });
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-2">
      {onApply ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t("stall__apply_hint")}
          onPress={() => {
            haptic.tick();
            onApply(!applied);
          }}
          className="min-h-11 flex-1 justify-center"
        >
          <Text className="font-normal text-caption text-muted">{note}</Text>
        </Pressable>
      ) : (
        <Text className="flex-1 text-caption text-muted">{note}</Text>
      )}
      {applied ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stall__dismiss")}
          hitSlop={8}
          onPress={() => dismissStall(exerciseId, latestSessionId)}
          className="h-11 w-11 items-center justify-center"
        >
          <X size={20} color={muted} />
        </Pressable>
      )}
    </View>
  );
}
