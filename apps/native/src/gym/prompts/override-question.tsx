import { formatWeight, usesGymHistory, type Equipment, type WeightUnit } from "@workspace/shared";
import { raiseWorkoutRepRange } from "@workspace/sync";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { usePreference, usePreferences } from "@/preferences";

import { capPromptKey, pendingCapPrompt } from "./cap-prompt";
import { dismissOverridePrompt, pendingOverridePrompt } from "./override-prompt";
import { useGymSetting } from "../use-gym-setting";
import { useGyms } from "../use-gyms";

/** The planned range of the exercise's working sets, as the Session started with it. */
export type PlannedRange = { min: number; max: number };

/**
 * One quiet question under an exercise's header, after the same override was logged in two
 * Sessions at this gym: use the step you keep taking, or move the rep range to the reps you keep
 * doing. It never asks while the max question is open, and a dismissal is remembered. Nothing
 * changes unless it is answered.
 */
export function OverridePrompt({
  exerciseId,
  gymId,
  sessionId,
  equipment,
  unit,
  workoutExerciseId,
  range,
}: {
  exerciseId: string;
  gymId: string;
  sessionId: string;
  equipment: Equipment;
  unit: WeightUnit;
  workoutExerciseId: string | null;
  range: PlannedRange | null;
}) {
  const asking = usePreference(({ ui }) =>
    pendingCapPrompt(ui.capPrompts, capPromptKey(gymId, exerciseId), sessionId)
      ? undefined
      : pendingOverridePrompt(ui.overridePrompts, gymId, exerciseId, sessionId),
  );
  if (!asking) return null;
  return asking.kind === "step" ? (
    usesGymHistory(equipment) ? (
      <StepAnswer
        key={asking.key}
        promptKey={asking.key}
        gymId={gymId}
        exerciseId={exerciseId}
        unit={unit}
        kg={asking.value}
      />
    ) : null
  ) : range && workoutExerciseId ? (
    <RangeAnswer
      key={asking.key}
      promptKey={asking.key}
      workoutExerciseId={workoutExerciseId}
      reps={asking.value}
      range={range}
    />
  ) : null;
}

function Question({
  text,
  yes,
  busy,
  onAnswer,
}: {
  text: string;
  yes: string;
  busy: boolean;
  onAnswer: (confirm: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2 rounded-xl bg-surface px-3 py-3" accessibilityLiveRegion="polite">
      <Text className="text-body text-foreground">{text}</Text>
      <View className="flex-row gap-2">
        <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => onAnswer(true)}>
          <Button.Label>{yes}</Button.Label>
        </Button>
        <Button size="sm" variant="tertiary" isDisabled={busy} onPress={() => onAnswer(false)}>
          <Button.Label>{t("gym__override_no")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function StepAnswer({
  promptKey,
  gymId,
  exerciseId,
  unit,
  kg,
}: {
  promptKey: string;
  gymId: string;
  exerciseId: string;
  unit: WeightUnit;
  kg: number;
}) {
  const { t } = useTranslation();
  const { updateUi } = usePreferences();
  const setting = useGymSetting(exerciseId, gymId);
  const [busy, setBusy] = useState(false);
  // The first step question is the stack's own; this one only follows an answered step.
  const answered = usePreference(({ ui }) =>
    ui.stepPrompts.includes(capPromptKey(gymId, exerciseId)),
  );
  if (!setting.ready || setting.gymId !== gymId) return null;
  if (setting.stepKg === null && !answered) return null;
  const same = setting.stepKg !== null && Math.abs(setting.stepKg - kg) < 0.01;
  const fits = kg >= 0.05 && (setting.maxKg === null || kg <= setting.maxKg);
  if (same || !fits) return null;
  const weight = formatWeight(kg, unit);
  const answer = async (confirm: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (confirm && !(await setting.save({ limits: { maxKg: setting.maxKg, stepKg: kg } })))
        return;
      await updateUi(({ overridePrompts }) => ({
        overridePrompts: dismissOverridePrompt(overridePrompts, promptKey, "step"),
      }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Question
      text={t("gym__override_step", { weight, unit })}
      yes={t("gym__override_step_yes", { weight, unit })}
      busy={busy}
      onAnswer={(confirm) => void answer(confirm).catch(() => undefined)}
    />
  );
}

function RangeAnswer({
  promptKey,
  workoutExerciseId,
  reps,
  range,
}: {
  promptKey: string;
  workoutExerciseId: string;
  reps: number;
  range: PlannedRange;
}) {
  const { t } = useTranslation();
  const { updateUi } = usePreferences();
  const { run, writeScope } = useGyms();
  const [busy, setBusy] = useState(false);
  const newMax = reps;
  const newMin = Math.max(1, reps - (range.max - range.min));
  const answer = async (confirm: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (confirm) {
        const wrote =
          (await run((db) => raiseWorkoutRepRange(db, workoutExerciseId, reps, writeScope))) ===
          true;
        if (!wrote) return;
      }
      await updateUi(({ overridePrompts }) => ({
        overridePrompts: dismissOverridePrompt(overridePrompts, promptKey, "range"),
      }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Question
      text={t("gym__override_range", {
        reps,
        min: range.min,
        max: range.max,
        newMin,
        newMax,
      })}
      yes={t("gym__override_range_yes")}
      busy={busy}
      onAnswer={(confirm) => void answer(confirm).catch(() => undefined)}
    />
  );
}
