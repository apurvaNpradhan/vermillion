import {
  MUSCLE_DETAIL_KEYS,
  detailsOf,
  type MuscleDetail,
  type MuscleGroup,
} from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

/**
 * "Which part?": an optional multi-select of a group's muscle details (ADR 0050). Renders nothing
 * for a group without details. Leaving every chip off means the whole group.
 */
export function DetailPicker({
  group,
  value,
  onToggle,
}: {
  group: MuscleGroup;
  value: readonly MuscleDetail[];
  onToggle: (detail: MuscleDetail) => void;
}) {
  const { t } = useTranslation();
  const details = detailsOf(group);
  if (details.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {details.map((detail) => {
        const selected = value.includes(detail);
        const label = t(MUSCLE_DETAIL_KEYS[detail]);
        return (
          <Pressable
            key={detail}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={label}
            onPress={() => {
              haptic.tick();
              onToggle(detail);
            }}
            className={`min-h-11 justify-center rounded-full border px-4 active:opacity-70 ${
              selected ? "border-identity bg-identity-soft" : "border-transparent bg-surface"
            }`}
          >
            <Text
              className={`text-label ${selected ? "font-medium text-foreground" : "text-muted"}`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
