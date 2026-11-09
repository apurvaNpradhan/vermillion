import { View } from "react-native";

/** The preview's single decorative motif. Never carries information or animates. */
export function Horizon() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-6 flex-row items-center gap-2"
    >
      <View className="h-0.5 w-10 rounded-full bg-brand-detail" />
      <View className="size-1 rounded-full bg-identity/50" />
    </View>
  );
}
