import {
  defaultStepKg,
  formatWeight,
  parseWeight,
  STEP_PROMPTS_MAX,
  type Equipment,
  type WeightUnit,
} from "@workspace/shared";
import { TextInput, Text, View } from "react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { usePreference, usePreferences } from "@/preferences";

import { capPromptKey } from "./cap-prompt";
import { useGymSetting } from "./use-gym-setting";

/** Either answer dismisses the prompt for this exercise at this gym. */
export function StepPrompt({
  exerciseId,
  gymId,
  equipment,
  unit,
}: {
  exerciseId: string;
  gymId: string;
  equipment: Equipment;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const key = capPromptKey(gymId, exerciseId);
  const answered = usePreference(({ ui }) => ui.stepPrompts.includes(key));
  const { updateUi } = usePreferences();
  const setting = useGymSetting(exerciseId, gymId);
  const fallback = formatWeight(defaultStepKg(equipment, unit, 0), unit);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (answered || !setting.ready || setting.gymId !== gymId || setting.stepKg !== null) return null;
  const input = draft ?? fallback;
  const stepKg = parseWeight(input, unit);
  const valid =
    stepKg !== null && stepKg >= 0.05 && (setting.maxKg === null || stepKg <= setting.maxKg);
  const answer = async (save: boolean) => {
    if (busy || (save && !valid)) return;
    setBusy(true);
    try {
      if (save && !(await setting.save({ limits: { maxKg: setting.maxKg, stepKg } }))) return;
      await updateUi(({ stepPrompts }) =>
        stepPrompts.includes(key)
          ? null
          : { stepPrompts: [...stepPrompts, key].slice(-STEP_PROMPTS_MAX) },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-2 rounded-xl bg-surface p-3">
      <Text className="text-body text-foreground">{t("gym__step_prompt")}</Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          accessibilityLabel={t("gym__load_step")}
          value={input}
          onChangeText={setDraft}
          inputMode="decimal"
          editable={!busy}
          selectTextOnFocus
          className="min-h-11 flex-1 rounded-xl bg-field px-3 text-body text-foreground"
        />
        <Text className="text-caption text-muted">{unit}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!valid || busy}
          onPress={() => void answer(true).catch(() => undefined)}
        >
          <Button.Label>{t("gym__step_save")}</Button.Label>
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={busy}
          onPress={() => void answer(false).catch(() => undefined)}
        >
          <Button.Label>{t("gym__step_keep", { weight: fallback, unit })}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
