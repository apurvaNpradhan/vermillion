import { useForm } from "@tanstack/react-form";
import { Fingerprint, ShieldCheck, Devices, type IconProps } from "phosphor-react-native";
import { useMemo, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { useThemeColor } from "heroui-native";
import { z } from "zod";

import { FlowStep, nextAfterCode, stepPosition, useSession } from "@/auth";
import { TextField } from "@/platform/forms/text-field";
import { haptic } from "@/platform/haptics";
import type { TranslationKey } from "@workspace/i18n";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { rememberPasskeySetup, shouldOfferPasskeySetup, useRegisterPasskey } from "@/passkeys";

import { useSaveName } from "../use-onboarding";

/** The required step: there is no skip. */
function NameStep() {
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
        await saveName(value.name.trim());
        haptic.confirm();
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
 * Account first: one question per screen, the only way into the app until every required step
 * is done. A passkey is offered once per device and can be skipped; the name cannot. Saving the
 * name refreshes the session, and the root guard then opens the app.
 */
export function OnboardingScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [step, setStep] = useState(() => nextAfterCode(shouldOfferPasskeySetup(userId)));
  return step === "passkey" ? (
    <PasskeyStep userId={userId} onFinished={() => setStep("name")} />
  ) : (
    <NameStep />
  );
}
