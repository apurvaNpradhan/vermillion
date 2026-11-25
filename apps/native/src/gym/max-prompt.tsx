import { formatWeight, type WeightUnit } from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { useMaxPromptStore } from "./max-prompt-store";
import { useMaxPrompt } from "./use-max-prompt";

/**
 * A small inline question under an exercise's header, after the suggestion was lowered to the
 * same weight twice: "Is 91 kg the max on this machine?". It answers in place; it never blocks.
 */
export function MaxPrompt({
  exerciseId,
  equipment,
  unit,
}: {
  exerciseId: string;
  equipment: Parameters<typeof useMaxPrompt>[1];
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const asking = useMaxPromptStore((state) => state.asking);
  const { confirm, dismiss } = useMaxPrompt(exerciseId, equipment, unit);
  if (!asking || asking.exerciseId !== exerciseId) return null;
  return (
    <View className="gap-2 rounded-xl bg-surface px-3 py-3" accessibilityLiveRegion="polite">
      <Text className="text-body text-foreground">
        {t("gym__max_prompt", { weight: formatWeight(asking.kg, unit), unit })}
      </Text>
      <View className="flex-row gap-2">
        <Button size="sm" variant="secondary" onPress={() => void confirm(asking)}>
          <Button.Label>{t("gym__max_yes")}</Button.Label>
        </Button>
        <Button size="sm" variant="tertiary" onPress={() => dismiss(asking)}>
          <Button.Label>{t("gym__max_no")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
