import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { z } from "zod";

import {
  FlowStep,
  firstOnboardingStep,
  nextOnboardingStep,
  stepPosition,
  useSession,
  type OnboardingStepId,
} from "@/auth";
import { TextField } from "@/platform/forms/text-field";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { isOnlineNow, useIsOnline } from "@/platform/network";
import { NeedsConnection } from "@/platform/ui/needs-connection";
import { FormError } from "@/platform/ui/form-error";

import { beginSetup, finishSetup } from "../setup-state";
import { useSaveName } from "../use-onboarding";
import { BodyStep } from "./body-step";
import { RemindersStep } from "./reminders-step";
import { UnitsStep } from "./units-step";

/** The required step: there is no skip. Saving it starts the setup steps that follow. */
function NameStep({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const { saveName } = useSaveName();
  const online = useIsOnline();
  const [failure, setFailure] = useState<string | null>(null);

  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1, t("auth__error_name_required")).max(200) }),
    [t],
  );
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      // Offline the caption says so; the save never starts as a paused request with a spinner.
      if (!isOnlineNow()) return;
      setFailure(null);
      try {
        // Marked before the save: the refreshed session must not open the app in between.
        beginSetup(userId);
        await saveName(value.name.trim());
        haptic.confirm();
        onSaved();
      } catch {
        // Offline or refused: the text stays so the person can try again.
        setFailure(t("onboarding__save_failed"));
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.values.name] as const}>
      {([isSubmitting, name]) => (
        <FlowStep
          leading="none"
          position={stepPosition("get-started", "name")}
          title={t("onboarding__name_title")}
          subtitle={t("onboarding__name_body")}
          action={{
            label: t("onboarding__continue"),
            onPress: () => void form.handleSubmit(),
            disabled: name.trim() === "" || !online,
            loading: isSubmitting,
          }}
        >
          <FormError message={failure} />
          <NeedsConnection />
          <form.Field name="name">
            {(field) => (
              <TextField
                field={field}
                accessibilityLabel={t("auth__name")}
                placeholder={t("auth__name_placeholder")}
                autoFocus
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="done"
                onSubmitEditing={() => void form.handleSubmit()}
              />
            )}
          </form.Field>
        </FlowStep>
      )}
    </form.Subscribe>
  );
}

/**
 * Account first: one question per screen, the only way into the app until the last step is done
 * or skipped. The name is required, then the units, the
 * body numbers and the notifications. Finishing clears the setup mark and the root guard opens
 * the app; an account that was closed mid-way resumes at the units.
 */
export function OnboardingScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [step, setStep] = useState<OnboardingStepId>(() =>
    firstOnboardingStep({ hasName: (session?.user.name ?? "").trim() !== "" }),
  );
  const advance = () => {
    const next = nextOnboardingStep(step);
    if (next) setStep(next);
    else finishSetup(userId);
  };
  switch (step) {
    case "name":
      return <NameStep userId={userId} onSaved={advance} />;
    case "units":
      return <UnitsStep onDone={advance} />;
    case "body":
      return <BodyStep onDone={advance} />;
    case "reminders":
      return <RemindersStep onDone={advance} />;
  }
}
