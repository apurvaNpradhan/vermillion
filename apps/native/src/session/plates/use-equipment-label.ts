import { formatWeight } from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";

import { useTranslation } from "@/platform/i18n";

/**
 * Names a bar or plate in its own unit, with no stray spaces: "Olympic 20 kg", "20 kg", "EZ 10
 * kg"; a zero-weight bar is "No bar".
 */
export function useEquipmentLabel(): (item: EquipmentRow) => string {
  const { t } = useTranslation();
  return (item) => {
    if (item.kind === "bar" && item.weightKg === 0) return t("plates__no_bar_label");
    const weight = t("plates__weight", {
      weight: formatWeight(item.weightKg, item.unit),
      unit: item.unit,
    });
    const name = item.label?.trim();
    return name ? t("plates__bar_label", { name, weight }) : weight;
  };
}
