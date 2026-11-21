import { PushPin } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/** The exercise's pinned note as one line under its name: a pin, then the text. */
export function PinnedNote({ note, lines = 2 }: { note: string; lines?: number }) {
  const subtle = useSubtleColor();
  return (
    <View className="flex-row items-start gap-1">
      <View className="pt-0.5">
        <PushPin size={14} weight="fill" color={subtle} />
      </View>
      <Text numberOfLines={lines} className="font-normal flex-1 text-caption text-foreground">
        {note}
      </Text>
    </View>
  );
}
