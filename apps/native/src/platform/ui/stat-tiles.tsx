import { Text, View } from "react-native";

export function StatTiles({
  items,
}: {
  items: readonly { label: string; value: string; detail?: string }[];
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {items.map((item) => (
        <View key={item.label} className="min-w-20 flex-1 gap-1 rounded-xl bg-surface p-3">
          <Text className="text-caption text-muted">{item.label}</Text>
          <Text
            className="text-title-md font-semibold text-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {item.value}
          </Text>
          {item.detail ? <Text className="text-caption text-muted">{item.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}
