import { CaretDown } from "phosphor-react-native";
import { Pressable, Text } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/** A filter pill under the search field: its label, a caret, and `bg-default` once it holds a value. */
export function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const subtle = useSubtleColor();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-9 flex-row items-center gap-1.5 rounded-full border active:opacity-70 px-3 ${
        active ? "border-foreground bg-default" : "border-transparent bg-surface"
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-label font-medium ${active ? "text-accent-text" : "text-muted"}`}
      >
        {label}
      </Text>
      <CaretDown size={20} color={subtle} />
    </Pressable>
  );
}
