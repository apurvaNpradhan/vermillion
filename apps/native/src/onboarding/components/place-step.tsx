import { useState } from "react";

import { TRAINING_PLACES, TRAINING_PLACE_KEYS, type TrainingPlace } from "@workspace/shared";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { usePreferences } from "@/preferences";

import { ChoiceList } from "./choice-list";

/**
 * Where the person trains. It only chooses the first bars and plates the calculator is seeded
 * with (the full gym kit, or a smaller home kit); an existing kit and programs stay as they are.
 */
export function PlaceStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { setUiAsync } = usePreferences();
  const [place, setPlace] = useState<TrainingPlace | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (place === null) return;
    setPending(true);
    setFailed(false);
    try {
      await setUiAsync({ trainingPlace: place });
      haptic.confirm();
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <FlowStep
      leading="none"
      position={stepPosition("get-started", "place")}
      title={t("onboarding__place_title")}
      subtitle={t("onboarding__place_body")}
      action={{
        label: t("onboarding__continue"),
        onPress: () => void save(),
        disabled: place === null,
        loading: pending,
      }}
      secondary={{ label: t("onboarding__skip"), onPress: onDone, disabled: pending }}
    >
      <FormError message={failed ? t("onboarding__prefs_failed") : null} />
      <ChoiceList
        accessibilityLabel={t("onboarding__place_title")}
        value={place}
        onChange={setPlace}
        choices={TRAINING_PLACES.map((value) => ({ value, label: t(TRAINING_PLACE_KEYS[value]) }))}
      />
    </FlowStep>
  );
}
