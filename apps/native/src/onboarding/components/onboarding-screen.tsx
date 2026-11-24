import { useForm } from "@tanstack/react-form";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { confirmOnline } from "@/platform/network";
import { NeedsConnection } from "@/platform/ui/needs-connection";
import { OtherAccountNotice, useSyncValue } from "@/sync";
import { FormError } from "@/platform/ui/form-error";

import { setupGate } from "../setup-gate";
import { finishSetup, saveSetupStep, savedSetupStep } from "../setup-state";
import { useSaveName } from "../use-onboarding";
import { BodyStep } from "./body-step";
import { DaysStep } from "./days-step";
import { ExperienceStep } from "./experience-step";
import { PlaceStep } from "./place-step";
import { RemindersStep } from "./reminders-step";
import { UnitsStep } from "./units-step";

/** The required step: there is no skip. Saving it starts the setup steps that follow. */
function NameStep({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const { saveName } = useSaveName();
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
      if (!(await confirmOnline())) return;
      setFailure(null);
      try {
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
            disabled: name.trim() === "",
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
 * or skipped. The name is required, then the units, the body numbers, three optional questions
 * (experience, training days, where you train) and the notifications. Each step is saved as it is
 * answered and the step reached is kept on the device, so an account closed mid-way resumes
 * there. Finishing clears the setup mark and the root guard opens the app.
 */
export function OnboardingScreen() {
  const { session } = useSession();
  const lockReason = useSyncValue((snapshot) => snapshot?.lockReason ?? null);
  if (!session) return null;
  if (setupGate(lockReason) === "owner-choice") return <OwnerChoice />;
  return (
    <AccountSetup
      key={session.user.id}
      userId={session.user.id}
      hasName={(session.user.name ?? "").trim() !== ""}
    />
  );
}

/** Before step 1 on a device another account's data holds: the same choice Home offers. */
function OwnerChoice() {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-center bg-background px-4"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <OtherAccountNotice />
    </View>
  );
}

function AccountSetup({ userId, hasName }: { userId: string; hasName: boolean }) {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [step, setStep] = useState<OnboardingStepId>(() =>
    firstOnboardingStep({
      hasName,
      resumeAt: savedSetupStep(userId),
    }),
  );
  const advance = () => {
    if (!mounted.current) return;
    const next = nextOnboardingStep(step);
    if (next) {
      saveSetupStep(userId, next);
      setStep(next);
    } else finishSetup(userId);
  };
  switch (step) {
    case "name":
      return <NameStep onSaved={advance} />;
    case "units":
      return <UnitsStep onDone={advance} />;
    case "body":
      return <BodyStep onDone={advance} />;
    case "experience":
      return <ExperienceStep onDone={advance} />;
    case "days":
      return <DaysStep onDone={advance} />;
    case "place":
      return <PlaceStep onDone={advance} />;
    case "reminders":
      return <RemindersStep onDone={advance} />;
  }
}
