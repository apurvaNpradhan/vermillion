import type { WeightUnit } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";
import { OptionSheet } from "@/platform/ui/option-sheet";

export function useExerciseUnitOptions(preferred: WeightUnit) {
  const { t } = useTranslation();
  const kg = t("training__unit_kg");
  const lb = t("training__unit_lb");
  return {
    default: t("exercise__unit_default", { unit: preferred === "kg" ? kg : lb }),
    kg,
    lb,
  };
}

export function ExerciseUnitSheet({
  isOpen,
  onOpenChange,
  preferred,
  unit,
  onSelect,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  preferred: WeightUnit;
  unit: WeightUnit | null;
  onSelect: (unit: WeightUnit | null) => void;
}) {
  const { t } = useTranslation();
  const labels = useExerciseUnitOptions(preferred);
  return (
    <OptionSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("exercise__unit")}
      options={[
        { value: "default", label: labels.default },
        { value: "kg", label: labels.kg },
        { value: "lb", label: labels.lb },
      ]}
      value={unit ?? "default"}
      onSelect={(value: WeightUnit | "default") => onSelect(value === "default" ? null : value)}
    />
  );
}
