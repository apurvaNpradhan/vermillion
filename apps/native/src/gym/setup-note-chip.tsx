import { Notepad } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/** The gym's setup note for an exercise, quiet, at the top of the exercise in a Session. */
export function SetupNoteChip({ note }: { note: string }) {
  const subtle = useSubtleColor();
  return (
    <View
      className="max-w-full flex-row items-center gap-1.5 self-start rounded-lg bg-surface px-2 py-1"
      accessibilityLabel={note}
    >
      <Notepad size={16} color={subtle} />
      <Text className="shrink text-caption text-muted" numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}
