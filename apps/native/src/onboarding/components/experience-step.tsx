import { useState } from "react";

import {
  TRAINING_EXPERIENCES,
  TRAINING_EXPERIENCE_HINT_KEYS,
  TRAINING_EXPERIENCE_KEYS,
  type TrainingExperience,
} from "@workspace/shared";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { usePreferences } from "@/preferences";

import { ChoiceList } from "./choice-list";
import { prefsFailureOf, type PrefsFailure } from "../prefs-failure";

/**
 * How long the person has lifted. It only picks the starting warm-up ramp (see
 * the preferences write); programs are never touched. Skipping stores nothing.
 */
export function ExperienceStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { setUiAsync } = usePreferences();
  const [experience, setExperience] = useState<TrainingExperience | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PrefsFailure | null>(null);

  const save = async () => {
    if (experience === null) return;
    setPending(true);
    setFailure(null);
    try {
      await setUiAsync({ trainingExperience: experience });
      haptic.confirm();
      onDone();
    } catch (error) {
      setFailure(error instanceof Error ? prefsFailureOf(error) : "onboarding__prefs_failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <FlowStep
      leading="none"
      position={stepPosition("get-started", "experience")}
      title={t("onboarding__experience_title")}
      subtitle={t("onboarding__experience_body")}
      action={{
        label: t("onboarding__continue"),
        onPress: () => void save(),
        disabled: experience === null,
        loading: pending,
      }}
      secondary={{ label: t("onboarding__skip"), onPress: onDone, disabled: pending }}
    >
      <FormError message={failure ? t(failure) : null} />
      <ChoiceList
        accessibilityLabel={t("onboarding__experience_title")}
        value={experience}
        onChange={setExperience}
        choices={TRAINING_EXPERIENCES.map((value) => ({
          value,
          label: t(TRAINING_EXPERIENCE_KEYS[value]),
          hint: t(TRAINING_EXPERIENCE_HINT_KEYS[value]),
        }))}
      />
    </FlowStep>
  );
}
