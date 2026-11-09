import { useQueryClient } from "@tanstack/react-query";
import { Spinner, cn } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { OTP_LENGTH, OTP_RESEND_SECONDS } from "@workspace/shared";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { OtpInput } from "@/platform/ui/otp-input";

import { stepPosition, type FlowKind } from "../flow";
import { rememberLoginMethod } from "../last-login-method";
import { refreshSession } from "../session";
import { useCountdown } from "../use-countdown";
import { useEmailCode } from "../use-email-code";
import { FlowStep } from "./flow-step";
import { useTurnstile } from "./use-turnstile";

/**
 * Second step of both flows: the emailed code. Submits itself on the last digit; a wrong code clears the cells
 * and says why. The route guard moves on (to onboarding or the app) once the session exists.
 */
export function CodeScreen({ email, flow }: { email: string; flow: FlowKind }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const turnstile = useTurnstile();
  const { sendCode, redeemCode } = useEmailCode();
  const countdown = useCountdown(OTP_RESEND_SECONDS);
  const [value, setValue] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit(code: string) {
    if (checking) return;
    setChecking(true);
    setFailure(null);
    setNotice(null);
    const result = await redeemCode(email, code);
    if (result.error) {
      setChecking(false);
      setValue("");
      setFailure(t(result.error));
      return;
    }
    haptic.confirm();
    rememberLoginMethod("email");
    await refreshSession(queryClient);
  }

  async function resend() {
    setResending(true);
    setFailure(null);
    const error = await sendCode(email, turnstile.headers);
    turnstile.reset();
    setResending(false);
    if (error) {
      setFailure(t(error));
      return;
    }
    setValue("");
    setNotice(t("auth__code_resent"));
    countdown.restart();
  }

  const resendLabel =
    countdown.remaining > 0
      ? t("auth__code_resend_wait", { seconds: countdown.remaining })
      : t("auth__code_resend_short");
  const resendDisabled = countdown.remaining > 0 || turnstile.pending || checking || resending;

  return (
    <FlowStep
      position={stepPosition(flow, "code")}
      title={t("auth__code_title")}
      subtitle={t("auth__code_body", { email })}
      action={{
        label: t("auth__continue"),
        onPress: () => void submit(value),
        disabled: value.length < OTP_LENGTH,
        loading: checking,
      }}
    >
      <OtpInput
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (failure) setFailure(null);
        }}
        onComplete={(code) => void submit(code)}
        error={failure !== null}
        disabled={checking}
        autoFocus
        length={OTP_LENGTH}
        groupSize={OTP_LENGTH / 2}
        accessibilityLabel={t("auth__code_label")}
        className="pt-2"
      />
      <FormError message={failure} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="text-caption text-muted">
          {notice}
        </Text>
      ) : null}
      {flow === "get-started" ? (
        <Text className="text-caption text-muted">{t("auth__code_existing_hint")}</Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-1.5 pt-2">
        <Text className="text-body text-muted">{t("auth__code_no_code")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: resendDisabled }}
          disabled={resendDisabled}
          hitSlop={8}
          onPress={() => void resend()}
          className="flex-row items-center gap-1.5"
        >
          <Text
            className={cn(
              "text-body font-semibold",
              resendDisabled ? "text-muted" : "text-identity",
            )}
          >
            {resendLabel}
          </Text>
          {resending ? <Spinner size="sm" /> : null}
        </Pressable>
      </View>
      {turnstile.widget}
    </FlowStep>
  );
}
