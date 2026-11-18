import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { TextField } from "@/platform/forms/text-field";
import { FormError } from "@/platform/ui/form-error";
import { NeedsConnection } from "@/platform/ui/needs-connection";
import { isOnlineNow, useIsOnline } from "@/platform/network";
import { Notice } from "@/platform/ui/notice";

import { stepPosition, type FlowKind } from "../flow";
import { useEmailCode } from "../use-email-code";
import { useRegistrationStatus } from "../use-registration-status";
import { FlowStep } from "./flow-step";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./use-turnstile";

/** A quiet label with breathing room between the sign-in methods. */
function OrDivider({ label }: { label: string }) {
  return (
    <View className="items-center py-2" accessibilityElementsHidden>
      <Text className="text-caption text-muted">{label}</Text>
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
  const online = useIsOnline();
  const creating = flow === "get-started";
  const hasSocial = Object.values(status?.providers ?? {}).some(Boolean);

  const schema = useMemo(() => z.object({ email: z.email(t("auth__error_email_invalid")) }), [t]);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (!isOnlineNow()) return;
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
            disabled: email.trim() === "" || turnstile.pending || !online,
            loading: isSubmitting,
          }}
        >
          {status && !status.open ? (
            <Notice
              status="accent"
              message={
                status.mode === "invite"
                  ? t("auth__invite_only", {
                      app: appConfig.displayName,
                      site: appConfig.urls.site,
                    })
                  : t("auth__closed")
              }
            />
          ) : null}
          <FormError message={failure} />
          <NeedsConnection />
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
          {hasSocial ? (
            <View className="gap-3 pt-6">
              <OrDivider label={t("auth__or")} />
              <SocialButtons
                headers={turnstile.headers}
                blocked={isSubmitting || turnstile.pending || !online}
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
