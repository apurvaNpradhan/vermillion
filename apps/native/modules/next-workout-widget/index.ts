import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { WidgetSnapshot } from "../../src/training/widget/widget-snapshot";

type NextWorkoutWidgetModule = { setSnapshot(snapshot: string): void };

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<NextWorkoutWidgetModule>("NextWorkoutWidget")
    : null;

/** Android only; null on iOS and in a dev client built before this module existed. */
export const nextWorkoutWidget = native && {
  /** Stores the snapshot (a JSON string, serialised once at this boundary) and redraws the widget. */
  setSnapshot: (snapshot: WidgetSnapshot) => native.setSnapshot(JSON.stringify(snapshot)),
};
