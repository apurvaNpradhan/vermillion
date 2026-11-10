import type { SetField, WeightUnit } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { Barbell } from "phosphor-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useThemeColor } from "heroui-native";

import { PlateCalculatorSheet } from "./plates";

/** The cell the keypad is editing, which is all an accessory needs to decide what to show. */
export type KeypadCell = {
  exercise: SessionExerciseDetail;
  setId: string;
  field: SetField;
  unit: WeightUnit;
  /** The weight the cell shows now: its value, else its Ghost value. */
  currentKg: number | null;
  /** Puts a weight into the cell (the calculator's Use). */
  putKg: (weightKg: number) => void;
};

/**
 * What sits above the keypad's keys for the cell being edited, or nothing. A barbell exercise's
 * weight cell gets the plate calculator chip; the keypad itself knows nothing about it.
 */
export function useKeypadAccessory(cell: KeypadCell | null): ReactNode {
  const { t } = useTranslation();
  const ink = useThemeColor("foreground");
  const [open, setOpen] = useState(false);
  if (!cell || cell.field !== "weight" || cell.exercise.exercise?.equipment !== "barbell") {
    return null;
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("plates__title")}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-2 rounded-xl border border-separator px-3"
      >
        <Barbell size={18} color={ink} />
        <Text className="text-body text-foreground">{t("plates__title")}</Text>
      </Pressable>
      <PlateCalculatorSheet
        isOpen={open}
        targetKg={cell.currentKg ?? 0}
        exerciseId={cell.exercise.exerciseId}
        onUse={(weightKg) => {
          cell.putKg(weightKg);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
