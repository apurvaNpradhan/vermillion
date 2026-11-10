import type { SetField, WeightUnit } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import type { ReactNode } from "react";

/** The cell the keypad is editing, which is all an accessory needs to decide what to show. */
export type KeypadCell = {
  exercise: SessionExerciseDetail;
  setId: string;
  field: SetField;
  unit: WeightUnit;
};

/**
 * What sits above the keypad's keys for the cell being edited, or nothing. The plate calculator
 * chip of barbell exercises plugs in here (slice 6); the keypad itself knows nothing about it.
 */
export function useKeypadAccessory(_cell: KeypadCell | null): ReactNode {
  return null;
}
