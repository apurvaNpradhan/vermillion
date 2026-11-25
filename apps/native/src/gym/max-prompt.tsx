import { formatWeight, type Equipment, type WeightUnit } from "@workspace/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { usePreference, usePreferences } from "@/preferences";

import { capPromptKey, dismissCapPrompt, pendingCapPrompt } from "./cap-prompt";
import { useGymSetting } from "./use-gym-setting";

/**
 * A small inline question under an exercise's header, after the suggestion was lowered to the
 * same weight twice: "Is 91 kg the max on this machine?". It answers in place; it never blocks.
 */
export function MaxPrompt({
  exerciseId,
  gymId,
  sessionId,
  equipment,
  unit,
}: {
  exerciseId: string;
  gymId: string;
  sessionId: string;
  equipment: Equipment;
  unit: WeightUnit;
}) {
  const key = capPromptKey(gymId, exerciseId);
  const asking = usePreference(({ ui }) => pendingCapPrompt(ui.capPrompts, key, sessionId));
  return asking ? (
    <PromptAnswer
      gymId={gymId}
      exerciseId={exerciseId}
      equipment={equipment}
      unit={unit}
      kg={asking.kg}
      promptKey={key}
    />
  ) : null;
}

function PromptAnswer({
  gymId,
  exerciseId,
  equipment,
  unit,
  kg,
  promptKey,
}: {
  gymId: string;
  exerciseId: string;
  equipment: Equipment;
  unit: WeightUnit;
  kg: number;
  promptKey: string;
}) {
  const { t } = useTranslation();
  const { updateUi } = usePreferences();
  const setting = useGymSetting(exerciseId, equipment, unit);
  const [busy, setBusy] = useState(false);
  if (!setting.ready || setting.gymId !== gymId || setting.maxKg !== null) return null;
  const answer = async (confirm: boolean) => {
    setBusy(true);
    try {
      if (
        confirm &&
        !(await setting.save({
          limits: {
            maxKg: kg,
            stepKg: setting.stepKg !== null && setting.stepKg <= kg ? setting.stepKg : null,
          },
        }))
      )
        return;
      await updateUi(({ capPrompts }) => ({ capPrompts: dismissCapPrompt(capPrompts, promptKey) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-2 rounded-xl bg-surface px-3 py-3" accessibilityLiveRegion="polite">
      <Text className="text-body text-foreground">
        {t("gym__max_prompt", { weight: formatWeight(kg, unit), unit })}
      </Text>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy}
          onPress={() => void answer(true).catch(() => undefined)}
        >
          <Button.Label>{t("gym__max_yes")}</Button.Label>
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={busy}
          onPress={() => void answer(false).catch(() => undefined)}
        >
          <Button.Label>{t("gym__max_no")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
