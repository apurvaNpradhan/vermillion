import { Text, View } from "react-native";

/** The same neutral title initial for workout rows and programs without a cover. */
export function PlanInitialTile({ title, size }: { title: string; size: number }) {
  const initial = [...title.trim()][0]?.toUpperCase() ?? "?";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-xl bg-default"
      style={{ width: size, height: size }}
    >
      <Text
        className="font-semibold text-title-md text-foreground"
        style={{ fontSize: size * 0.42 }}
      >
        {initial}
      </Text>
    </View>
  );
}
