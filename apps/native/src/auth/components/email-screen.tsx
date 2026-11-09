import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";

import { passkeysSupported } from "@/passkeys";
import { useTranslation } from "@/platform/i18n";
import { TextField } from "@/platform/forms/text-field";
import { FormError } from "@/platform/ui/form-error";
import { Notice } from "@/platform/ui/notice";

import { stepPosition, type FlowKind } from "../flow";
import { useEmailCode } from "../use-email-code";
import { useRegistrationStatus } from "../use-registration-status";
import { FlowStep } from "./flow-step";
import { PasskeySignInButton } from "./passkey-sign-in-button";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./use-turnstile";

/** A hairline, "or", a hairline: separates the email field from the other ways in. */
function OrDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-2" accessibilityElementsHidden>
      <View className="h-px flex-1 bg-border" />
      <Text className="text-caption text-muted">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

/**
 * First step of both flows: an email address. A code follows on the next screen, for new and
 * returning people alike, and the answer never says whether the address has an account.
 */
export function EmailScreen({ flow }: { flow: FlowKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const turnstile = useTurnstile();
  const status = useRegistrationStatus();
  const { sendCode } = useEmailCode();
  const [failure, setFailure] = useState<string | null>(null);
  const creating = flow === "get-started";
  // A passkey only signs in someone who already has one, so the create path leaves it out.
  const hasPasskey = !creating && passkeysSupported();
  const hasSocial = Object.values(status?.providers ?? {}).some(Boolean);

  const schema = useMemo(() => z.object({ email: z.email(t("auth__error_email_invalid")) }), [t]);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const email = value.email.trim();
      const error = await sendCode(email, turnstile.headers);
      turnstile.reset();
      if (error) {
        setFailure(t(error));
        return;
      }
      router.push({ pathname: "/code", params: { email, flow } });
    },
  });

  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.values.email] as const}>
      {([isSubmitting, email]) => (
        <FlowStep
          position={stepPosition(flow, "email")}
          title={creating ? t("auth__email_title_new") : t("auth__email_title_back")}
          subtitle={t("auth__email_subtitle")}
          action={{
            label: t("auth__continue"),
            onPress: () => void form.handleSubmit(),
            disabled: email.trim() === "" || turnstile.pending,
            loading: isSubmitting,
          }}
        >
          {status && !status.open ? <Notice status="accent" message={t("auth__closed")} /> : null}
          <FormError message={failure} />
          <form.Field name="email">
            {(field) => (
              <TextField
                field={field}
                accessibilityLabel={t("auth__email")}
                placeholder={t("auth__email_placeholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="send"
                autoFocus
                onSubmitEditing={() => void form.handleSubmit()}
              />
            )}
          </form.Field>
          <Text className="text-caption text-muted">
            {creating ? t("auth__email_helper_new") : t("auth__email_helper_back")}
          </Text>
          {hasPasskey || hasSocial ? (
            <View className="gap-3 pt-6">
              <OrDivider label={t("auth__or")} />
              {hasPasskey ? (
                <PasskeySignInButton blocked={isSubmitting || turnstile.pending} />
              ) : null}
              <SocialButtons
                headers={turnstile.headers}
                blocked={isSubmitting || turnstile.pending}
                onDone={turnstile.reset}
              />
            </View>
          ) : null}
          {turnstile.widget}
        </FlowStep>
      )}
    </form.Subscribe>
  );
}
