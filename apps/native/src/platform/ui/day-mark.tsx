import { View } from "react-native";

/** How a day or Slot is marked: the ledger marks shared by every strip. */
export type DayMarkState = "done" | "skipped" | "next" | "todo" | "rest";

/**
 * One ledger mark: done is a filled ink square, skipped a hollow square with a hairline slash, next
 * the accent dot, still to do a hollow square and rest a short hairline. Home's week strip, the
 * Train cycle strip and the Active program card all draw days with it.
 */
export function DayMark({ state }: { state: DayMarkState }) {
  if (state === "rest") return <View className="h-px w-3 bg-muted" />;
  if (state === "done") return <View className="h-3.5 w-3.5 rounded-sm bg-foreground" />;
  if (state === "skipped") {
    return (
      <View className="h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-sm border border-foreground">
        <View
          className="absolute h-px bg-foreground"
          style={{ width: 20, transform: [{ rotate: "-45deg" }] }}
        />
      </View>
    );
  }
  if (state === "next") {
    return (
      <View className="h-3.5 w-3.5 items-center justify-center">
        <View className="h-2.5 w-2.5 rounded-full bg-accent" />
      </View>
    );
  }
  return <View className="h-3.5 w-3.5 rounded-sm border border-separator" />;
}
