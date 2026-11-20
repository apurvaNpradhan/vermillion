import { X } from "phosphor-react-native";
import { Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

export type FilterChip = { key: string; label: string; onRemove: () => void };

/** The active filters as removable chips; one tap on a chip removes its filter. */
export function FilterChips({ chips }: { chips: FilterChip[] }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  return chips.map((chip) => (
    <Pressable
      key={chip.key}
      accessibilityRole="button"
      accessibilityLabel={t("exercise__filter_remove", { name: chip.label })}
      onPress={chip.onRemove}
      hitSlop={4}
      className="h-9 flex-row items-center gap-1.5 rounded-full bg-default pl-3 pr-2 active:opacity-70"
    >
      <Text className="text-label font-medium text-foreground">{chip.label}</Text>
      <X size={16} color={subtle} />
    </Pressable>
  ));
}
