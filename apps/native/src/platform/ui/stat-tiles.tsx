import { Text, View } from "react-native";

/**
 * Stats as one inline row of label and value pairs on the canvas: a muted caption above a
 * title-sized tabular value, no tiles or boxes. An optional detail line sits under the value.
 */
export function StatTiles({
  items,
}: {
  items: readonly { label: string; value: string; detail?: string }[];
}) {
  return (
    <View className="flex-row flex-wrap gap-x-8 gap-y-3">
      {items.map((item) => (
        <View key={item.label} className="gap-0.5">
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
