import {
  checkWeighIn,
  formatBodyWeight,
  type WeighInCheck,
  type WeightUnit,
} from "@workspace/shared";
import { useCallback, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ChoiceDialog } from "@/platform/ui/choice-dialog";

type Asked = {
  check: WeighInCheck;
  /** The weigh-in as the lifter typed it, in their unit. */
  value: string;
  proceed: () => void;
  change: () => void;
};

/**
 * "Check this weigh-in": one quiet question before a weight far from the trend (or outside 25 to
 * 350 kg) is saved. `review` returns whether the dialog opened, in which case the save waits for
 * Keep. The dialog stays mounted and is opened by a change, so it always presents.
 */
export function useWeighInGuard(unit: WeightUnit) {
  const { t, i18n } = useTranslation();
  const [asked, setAsked] = useState<Asked | null>(null);
  const [open, setOpen] = useState(false);

  const review = useCallback(
    (input: {
      kg: number;
      trendKg: number | null;
      value: string;
      proceed: () => void;
      change: () => void;
    }): boolean => {
      const check = checkWeighIn({ kg: input.kg, trendKg: input.trendKg, unit });
      if (!check) return false;
      setAsked({ check, value: input.value, proceed: input.proceed, change: input.change });
      setOpen(true);
      return true;
    },
    [unit],
  );

  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const value = asked ? `${asked.value} ${unitName}` : "";
  const description = !asked
    ? ""
    : asked.check.reason === "out_of_range"
      ? t("guard__weigh_in_range", { value })
      : t("guard__weigh_in_trend", {
          trend: `${formatBodyWeight(asked.check.trendKg, unit, i18n.language)} ${unitName}`,
          value,
        });
  const dialog = (
    <ChoiceDialog
      isOpen={open}
      onClose={() => setOpen(false)}
      title={t("guard__weigh_in_title")}
      description={description}
      choices={
        asked
          ? [
              { label: t("guard__change"), primary: true, onPress: asked.change },
              { label: t("guard__keep", { value }), onPress: asked.proceed },
            ]
          : []
      }
    />
  );
  return { review, dialog };
}
