import { previewRules, type ExerciseType, type WeightUnit } from "@workspace/shared";
import { useMemo } from "react";

import { useExerciseActions } from "../use-exercise-actions";
import { useExerciseProgression, useExerciseRule } from "../detail/use-exercise-progression";
import { ProgressionRuleSheet } from "./progression-rule-sheet";

/**
 * The exercise page's rule sheet. It reads what the Workout the lifter trains next would ask of
 * this lift, the same way "Next time" does, so the preview is the prescription they will meet.
 */
export function ExerciseRuleSheet({
  exerciseId,
  title,
  type,
  gymId,
  isOpen,
  onOpenChange,
}: {
  exerciseId: string;
  title: string;
  type: ExerciseType;
  gymId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setting = useExerciseRule(exerciseId);
  const { setProgressionRule } = useExerciseActions();
  const next = useExerciseProgression(exerciseId, gymId);
  const input = next?.input;
  const previews = useMemo(() => (isOpen && input ? previewRules(input) : null), [isOpen, input]);
  const unit: WeightUnit = next?.unit ?? "kg";
  return (
    <ProgressionRuleSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      rule={setting.value ?? null}
      onSelect={(rule) => void setProgressionRule(exerciseId, rule).catch(() => undefined)}
      previews={previews}
      type={type}
      unit={unit}
    />
  );
}
