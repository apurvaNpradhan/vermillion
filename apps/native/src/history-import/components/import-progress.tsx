import { Text, View } from "react-native";

/** A bar and a caption for work done in slices (reading a file, writing, undoing). */
export function ImportProgress({ label, progress }: { label: string; progress: number }) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      className="gap-3 rounded-2xl bg-surface p-4"
    >
      <Text className="font-normal text-body text-foreground">{label}</Text>
      <View className="h-2 overflow-hidden rounded-full bg-default">
        <View className="h-2 rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </View>
      <Text
        className="font-normal text-caption text-muted"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {percent}%
      </Text>
    </View>
  );
}
