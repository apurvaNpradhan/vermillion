import { useForm } from "@tanstack/react-form";
import { Fingerprint, ShieldCheck, Devices, type IconProps } from "phosphor-react-native";
import { useMemo, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { useThemeColor } from "heroui-native";
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
import type { TranslationKey } from "@workspace/i18n";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { rememberPasskeySetup, shouldOfferPasskeySetup, useRegisterPasskey } from "@/passkeys";

import { beginSetup, finishSetup } from "../setup-state";
import { useSaveName } from "../use-onboarding";
import { BodyStep } from "./body-step";
import { RemindersStep } from "./reminders-step";
import { UnitsStep } from "./units-step";

/** The required step: there is no skip. Saving it starts the setup steps that follow. */
function NameStep({ userId, onSaved }: { userId: string; onSaved: () => void }) {
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
            disabled: name.trim() === "",
            loading: isSubmitting,
          }}
        >
          <FormError message={failure} />
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

const BENEFITS: { icon: ComponentType<IconProps>; title: TranslationKey; body: TranslationKey }[] =
  [
    { icon: Fingerprint, title: "passkeys__benefit_fast", body: "passkeys__benefit_fast_body" },
    { icon: ShieldCheck, title: "passkeys__benefit_safe", body: "passkeys__benefit_safe_body" },
    { icon: Devices, title: "passkeys__benefit_sync", body: "passkeys__benefit_sync_body" },
  ];

/** Offers a passkey right after the account exists. Done or skipped, the name comes next. */
function PasskeyStep({ userId, onFinished }: { userId: string; onFinished: () => void }) {
  const { t } = useTranslation();
  const { register } = useRegisterPasskey();
  const foreground = useThemeColor("foreground");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const finish = (answer: "done" | "skipped") => {
    rememberPasskeySetup(userId, answer);
    onFinished();
  };

  return (
    <FlowStep
      leading="none"
      position={stepPosition("get-started", "passkey")}
      title={t("passkeys__setup_title")}
      subtitle={t("passkeys__setup_body")}
      action={{
        label: t("passkeys__setup_action"),
        loading: pending,
        onPress: async () => {
          setFailure(null);
          setPending(true);
          const outcome = await register();
          setPending(false);
          if (outcome.status === "done") finish("done");
          else if (outcome.status === "error") setFailure(t(outcome.messageKey));
        },
      }}
      secondary={{ label: t("passkeys__setup_skip"), onPress: () => finish("skipped") }}
    >
      <FormError message={failure} />
      {BENEFITS.map(({ icon: Icon, title, body }) => (
        <View key={title} className="flex-row items-start gap-3 py-1">
          <Icon size={24} color={foreground} />
          <View className="flex-1 gap-0.5">
            <Text className="text-body font-semibold text-foreground">{t(title)}</Text>
            <Text className="text-body text-muted">{t(body)}</Text>
          </View>
        </View>
      ))}
      <Text className="pt-2 text-caption text-muted">{t("passkeys__setup_footnote")}</Text>
    </FlowStep>
  );
}

/**
 * Account first: one question per screen, the only way into the app until the last step is done
 * or skipped. A passkey is offered once per device, the name is required, then the units, the
 * body numbers and the notifications. Finishing clears the setup mark and the root guard opens
 * the app; an account that was closed mid-way resumes at the units.
 */
export function OnboardingScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [step, setStep] = useState<OnboardingStepId>(() =>
    firstOnboardingStep({
      hasName: (session?.user.name ?? "").trim() !== "",
      offerPasskey: shouldOfferPasskeySetup(userId),
    }),
  );
  const advance = () => {
    const next = nextOnboardingStep(step);
    if (next) setStep(next);
    else finishSetup(userId);
  };
  switch (step) {
    case "passkey":
      return <PasskeyStep userId={userId} onFinished={advance} />;
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
