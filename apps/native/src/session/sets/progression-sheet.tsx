import {
  type EffortScale,
  type ExerciseType,
  type Progression,
  type WeightUnit,
} from "@workspace/shared";
import { SheetPortal } from "@/platform/ui/modal-state";
import { BottomSheet } from "heroui-native";
import { useMemo } from "react";

import { EvidenceLines } from "@/platform/ui/evidence-lines";
import { useMountOnOpen } from "@/platform/ui/mount-on-open";
import { useTranslation } from "@/platform/i18n";
import {
  progressionParams,
  progressionLabelKey,
  progressionReasonKey,
} from "@/platform/ui/progression-reason";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useSheetAnimation } from "@/platform/ui/sheet-motion";

/** The suggestion as the exercise's second line shows it, and the reason the sheet explains. */
export type ProgressionNote = {
  /** "Add 2.5 kg", or the mixed label when sets differ. */
  label: string;
  /** The sheet text: one reason, or one line per set when they differ. */
  description: string;
};

/** The next-session suggestion of an exercise as short text; null when there is nothing to say. */
export function useProgressionNote(
  input: {
    suggestion: Progression;
    badges: readonly string[];
    unit: WeightUnit;
    effortScale: EffortScale;
  } | null,
): ProgressionNote | null {
  const { t } = useTranslation();
  return useMemo(() => {
    if (!input) return null;
    const { suggestion, badges, unit, effortScale } = input;
    const explanations = badges.flatMap((badge, index) => {
      const outcome = suggestion.outcomes[index];
      if (!outcome) return [];
      const params = progressionParams(suggestion, outcome, unit);
      return [
        {
          badge,
          label: t(progressionLabelKey(outcome), params),
          reason: t(progressionReasonKey(outcome, effortScale), params),
          show: outcome.reason !== "same_as_last",
        },
      ];
    });
    const first = explanations[0];
    if (!first || !explanations.some((entry) => entry.show)) return null;
    const mixed = explanations.some((entry) => entry.reason !== first.reason);
    return {
      label: mixed ? t("progress__label_mixed") : first.label,
      description: mixed
        ? explanations
            .map(({ badge, reason }) => t("progress__set_reason", { badge, reason }))
            .join("\n")
        : first.reason,
    };
  }, [input, t]);
}

/** Why the suggestion is what it is. Opened by a tap on the suggestion in the exercise's header. */
export function ProgressionSheet({
  note,
  suggestion,
  unit,
  type,
  isOpen,
  onOpenChange,
}: {
  note: ProgressionNote;
  suggestion: Progression;
  unit: WeightUnit;
  type: ExerciseType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const animation = useSheetAnimation();
  const { t } = useTranslation();
  const sheet = useMountOnOpen(isOpen);
  if (!sheet.mounted) return null;
  return (
    <BottomSheet animation={animation} isOpen={sheet.open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          <BottomSheet.Title>{t("progress__next")}</BottomSheet.Title>
          <BottomSheet.Description>{note.description}</BottomSheet.Description>
          <EvidenceLines evidence={suggestion.evidence} type={type} unit={unit} />
        </ScrollableSheetContent>
      </SheetPortal>
    </BottomSheet>
  );
}
