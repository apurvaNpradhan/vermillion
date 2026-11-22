import { View } from "react-native";

/** The record toast's glyph: one small ember dot, no star. */
export function RecordToastIcon() {
  return <View accessible={false} className="size-2.5 rounded-full bg-brand-detail" />;
}
