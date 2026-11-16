import { usePreferences } from "@/preferences";

/** The preferences the training screens format with: weight unit, effort scale, default rest. */
export function useTrainingPreferences() {
  const { preferences } = usePreferences();
  const { weightUnit, effortScale, defaultRestSeconds } = preferences.ui;
  return { weightUnit, effortScale, defaultRestSeconds };
}
