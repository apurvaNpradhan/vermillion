import type { ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { Keypad } from "@/platform/ui/keypad";
import type { WeightUnit } from "@workspace/shared";

import { useKeypadAccessory } from "../keypad-accessory";
import type { useLoggingState } from "../use-logging-state";

type Logging = ReturnType<typeof useLoggingState>;

/** What sits above the keypad's keys for the cell being edited (the plate calculator chip). */
export function useSessionKeypadAccessory(logging: Logging, unit: WeightUnit): ReactNode {
  const cell =
    logging.entry && logging.activeField
      ? (() => {
          const at = logging.found.get(logging.entry.cell.setId);
          return at
            ? {
                exercise: at.exercise,
                setId: at.set.id,
                field: logging.activeField,
                unit,
                currentKg:
                  logging.typedValue !== undefined
                    ? logging.typedValue
                    : (at.set.weightKg ?? logging.ghostsFor(at.set.id).weight ?? null),
                putKg: logging.putValue,
              }
            : null;
        })()
      : null;
  return useKeypadAccessory(cell);
}

/**
 * The number pad for the cell being edited, or nothing while no cell is open. `withinSet` keeps
 * Next inside the edited set, for a screen that shows only that set.
 */
export function SessionKeypad({
  logging,
  accessory,
  withinSet = false,
}: {
  logging: Logging;
  accessory: ReactNode;
  withinSet?: boolean;
}) {
  const { t } = useTranslation();
  if (!logging.entry || !logging.activeField) return null;
  return (
    <Keypad
      labels={{
        point: t("session__key_point"),
        backspace: t("session__key_backspace"),
        decrease: t("session__key_decrease", { step: logging.stepText }),
        increase: t("session__key_increase", { step: logging.stepText }),
        next: t("session__key_next"),
        done: t("session__key_done"),
      }}
      allowPoint={logging.activeField === "weight" || logging.activeField === "distance"}
      hasNext={withinSet ? logging.hasNextInSet : logging.hasNext}
      stepText={logging.stepText}
      accessory={accessory}
      onKey={logging.onKey}
      onStep={logging.onStep}
      onNext={withinSet ? logging.onNextInSet : logging.onNext}
      onDone={logging.closeKeypad}
    />
  );
}
