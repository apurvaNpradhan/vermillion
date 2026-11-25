import { shallow } from "zustand/shallow";

import { usePreference } from "@/preferences";

/** The preferences the training screens format with: weight unit, effort scale, default rest. */
export function useTrainingPreferences() {
  return usePreference(
    ({ ui }) => ({
      weightUnit: ui.weightUnit,
      weightIncrementKg: ui.weightIncrementKg,
      weightIncrementUnit: ui.weightIncrementUnit,
      effortScale: ui.effortScale,
      defaultRestSeconds: ui.defaultRestSeconds,
    }),
    shallow,
  );
}
