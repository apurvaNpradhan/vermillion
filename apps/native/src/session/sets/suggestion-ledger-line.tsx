import {
  SET_FIELDS,
  type DoneSet,
  type ExerciseType,
  type SuggestionLedger,
  type WeightUnit,
} from "@workspace/shared";
import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { formatCell } from "../logging/set-values";

/**
 * One quiet line under a finished exercise: what the snapshot suggested next to what was done,
 * "Suggested 100 kg × 8. Did 97.5 kg × 6. Met 2 of 3 sets." Nothing shows without a snapshot.
 */
export function SuggestionLedgerLine({
  ledger,
  type,
  unit,
  unitLabel,
}: {
  ledger: SuggestionLedger;
  type: ExerciseType;
  unit: WeightUnit;
  unitLabel: string;
}) {
  const { t } = useTranslation();
  const fields: readonly string[] = SET_FIELDS[type];
  const text = (values: DoneSet) => {
    if (!fields.includes("reps") || values.reps == null) return null;
    if (fields.includes("weight") && values.weight_kg != null)
      return `${formatCell("weight", values.weight_kg, unit, type)} ${unitLabel} × ${values.reps}`;
    return t("session__ledger_reps", { count: values.reps });
  };
  const suggested = text(ledger.suggested);
  if (suggested === null) return null;
  const done = text(ledger.done) ?? "";
  const params = { suggested, done, met: ledger.met, count: ledger.total };
  const line =
    ledger.total === 1
      ? ledger.met === 1
        ? t("session__ledger_met", params)
        : t("session__ledger_miss", params)
      : ledger.met === ledger.total
        ? t("session__ledger_all", params)
        : t("session__ledger_some", params);
  return <Text className="font-normal py-1 text-caption text-muted">{line}</Text>;
}
