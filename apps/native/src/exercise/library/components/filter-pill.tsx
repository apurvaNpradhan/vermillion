import { CaretDown } from "phosphor-react-native";
import { Pressable, Text } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/** A filter pill under the search field: its label, a caret, and `bg-default` once it holds a value. */
export function FilterPill({
  label,
  active,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const subtle = useSubtleColor();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${label}`}
      onPress={onPress}
      className={`h-9 flex-row items-center gap-1.5 rounded-full border px-3 ${
        active ? "border-identity bg-default" : "border-border bg-surface"
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-label font-medium ${active ? "text-foreground" : "text-muted"}`}
      >
        {label}
      </Text>
      <CaretDown size={12} weight="bold" color={subtle} />
    </Pressable>
  );
}
