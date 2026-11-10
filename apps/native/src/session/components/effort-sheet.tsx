import { EFFORT_STEPS, type EffortScale, type EffortStep } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { formatEffortRange } from "@/training";

const NONE = "none";

/** One effort for one set, in the user's scale (RPE or RIR); the first option clears it. */
export function SessionEffortSheet({
  isOpen,
  onOpenChange,
  value,
  scale,
  onSelect,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The stored RPE, or null. */
  value: number | null;
  scale: EffortScale;
  onSelect: (rpe: EffortStep | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <OptionSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("training__effort_label")}
      description={t(scale === "rpe" ? "training__effort_rpe_name" : "training__effort_rir_name")}
      options={[
        { value: NONE, label: t("training__effort_none") },
        // Hardest first, as the stored RPE counts up to 10.
        ...[...EFFORT_STEPS]
          .reverse()
          .map((step) => ({ value: String(step), label: formatEffortRange(step, step, scale) })),
      ]}
      value={value === null ? NONE : String(value)}
      onSelect={(selected) => {
        if (selected === NONE) return onSelect(null);
        const step = EFFORT_STEPS.find((candidate) => String(candidate) === selected);
        if (step !== undefined) onSelect(step);
      }}
    />
  );
}
