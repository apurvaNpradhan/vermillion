import {
  formatWeight,
  raisedRange,
  usesGymHistory,
  type Equipment,
  type RepRange,
  type WeightUnit,
} from "@workspace/shared";
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

/**
 * One quiet question under an exercise's header, after the same override was logged in two
 * Sessions: use the step you keep taking at this gym, or move the rep range of this workout's
 * sets to the reps you keep doing. It never asks while the max question is open, asks only what
 * it can show (a step question that cannot be asked here does not hide the range one), and a
 * dismissal is remembered. Nothing changes unless it is answered.
 */
export function OverridePrompt({
  exerciseId,
  gymId,
  sessionId,
  equipment,
  unit,
  workoutExerciseId,
}: {
  exerciseId: string;
  gymId: string | null;
  sessionId: string;
  equipment: Equipment;
  unit: WeightUnit;
  workoutExerciseId: string | null;
}) {
  const setting = useGymSetting(exerciseId, gymId);
  // The first step question is the stack's own; this one only follows an answered step.
  const answered = usePreference(({ ui }) =>
    gymId === null ? false : ui.stepPrompts.includes(capPromptKey(gymId, exerciseId)),
  );
  const maxOpen = usePreference(({ ui }) =>
    gymId === null
      ? false
      : pendingCapPrompt(ui.capPrompts, capPromptKey(gymId, exerciseId), sessionId) !== undefined,
  );
  const stepRenders = (kg: number) => {
    if (gymId === null || !usesGymHistory(equipment)) return false;
    if (!setting.ready || setting.gymId !== gymId) return false;
    if (setting.stepKg === null && !answered) return false;
    const same = setting.stepKg !== null && Math.abs(setting.stepKg - kg) < 0.01;
    const fits = kg >= 0.05 && (setting.maxKg === null || kg <= setting.maxKg);
    return !same && fits;
  };
  const asking = usePreference(({ ui }) =>
    maxOpen
      ? undefined
      : pendingOverridePrompt(
          ui.overridePrompts,
          { sessionId, exerciseId, gymId, workoutExerciseId },
          (prompt) =>
            prompt.kind === "step"
              ? stepRenders(prompt.value)
              : workoutExerciseId !== null &&
                prompt.rangeMin !== undefined &&
                prompt.rangeMax !== undefined,
        ),
  );
  if (!asking) return null;
  if (asking.kind === "step")
    return gymId === null ? null : (
      <StepAnswer
        key={asking.key}
        promptKey={asking.key}
        setting={setting}
        unit={unit}
        kg={asking.value}
      />
    );
  return workoutExerciseId !== null &&
    asking.rangeMin !== undefined &&
    asking.rangeMax !== undefined ? (
    <RangeAnswer
      key={asking.key}
      promptKey={asking.key}
      workoutExerciseId={workoutExerciseId}
      reps={asking.value}
      range={{ min: asking.rangeMin, max: asking.rangeMax }}
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
  setting,
  unit,
  kg,
}: {
  promptKey: string;
  setting: ReturnType<typeof useGymSetting>;
  unit: WeightUnit;
  kg: number;
}) {
  const { t } = useTranslation();
  const { updateUi } = usePreferences();
  const [busy, setBusy] = useState(false);
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
  range: RepRange;
}) {
  const { t } = useTranslation();
  const { updateUi } = usePreferences();
  const { run, writeScope } = useGyms();
  const [busy, setBusy] = useState(false);
  const { min: newMin, max: newMax } = raisedRange(range, reps);
  const answer = async (confirm: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // A Workout that no longer has sets on that range has nothing to change: the question is
      // answered either way.
      if (confirm) {
        const wrote = await run((db) =>
          raiseWorkoutRepRange(db, workoutExerciseId, reps, range, writeScope),
        );
        if (wrote === null) return;
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
      yes={t("gym__override_range_yes", { newMin, newMax })}
      busy={busy}
      onAnswer={(confirm) => void answer(confirm).catch(() => undefined)}
    />
  );
}
