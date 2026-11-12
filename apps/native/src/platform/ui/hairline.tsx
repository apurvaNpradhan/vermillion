import { StyleSheet, View } from "react-native";

/** A full-width divider one physical pixel thick, in the separator colour. */
export function Hairline() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="bg-separator"
      style={{ height: StyleSheet.hairlineWidth }}
    />
  );
}
