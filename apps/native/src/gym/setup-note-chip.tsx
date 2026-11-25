import { Notepad } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/** The gym's setup note for an exercise, quiet, at the top of the exercise in a Session. */
export function SetupNoteChip({ note }: { note: string }) {
  const subtle = useSubtleColor();
  return (
    <View className="flex-row items-center gap-1.5 px-1" accessibilityLabel={note}>
      <Notepad size={16} color={subtle} />
      <Text className="flex-1 text-caption text-muted" numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}
