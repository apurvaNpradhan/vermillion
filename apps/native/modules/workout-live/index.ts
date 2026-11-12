import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { WorkoutLiveState } from "../../src/session/workout-live-state";

type WorkoutLiveModule = {
  show(state: string): void;
  update(state: string): void;
  dismiss(): void;
  promotionStatus(): "granted" | "denied" | "unsupported";
  openPromotionSettings(): void;
};

const native =
  Platform.OS === "android" ? requireOptionalNativeModule<WorkoutLiveModule>("WorkoutLive") : null;

// Serialize once at the native boundary: Expo's generic map converter cannot carry nested nulls.
export const workoutLive = native && {
  show: (state: WorkoutLiveState) => native.show(JSON.stringify(state)),
  update: (state: WorkoutLiveState) => native.update(JSON.stringify(state)),
  dismiss: () => native.dismiss(),
  promotionStatus: () => native.promotionStatus(),
  openPromotionSettings: () => native.openPromotionSettings(),
};
