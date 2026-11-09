import { Spinner, useToast } from "heroui-native";
import { useState } from "react";
import { Text } from "react-native";
import { z } from "zod";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";
import { Field } from "@/platform/ui/field";
import { FormError } from "@/platform/ui/form-error";
import { OtpInput } from "@/platform/ui/otp-input";

import { useChangeEmail } from "../use-change-email";

/**
 * Change the sign-in address in two steps: the new address, then the code sent to it. The
 * current session proves the old address. Closes itself when the change is done.
 */
export function ChangeEmailSection({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { requestChange, confirmChange } = useChangeEmail();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = z.email().safeParse(email.trim()).success;

  async function send() {
    const target = email.trim();
    if (!z.email().safeParse(target).success) {
      setFailure(t("auth__error_email_invalid"));
      return;
    }
    setBusy(true);
    setFailure(null);
    const error = await requestChange(target);
    setBusy(false);
    if (error) {
      setFailure(t(error));
      return;
    }
    setSent(target);
  }

  async function confirm(otp: string) {
    if (sent === null || busy) return;
    setBusy(true);
    setFailure(null);
    const error = await confirmChange(sent, otp);
    setBusy(false);
    if (error) {
      setCode("");
      setFailure(t(error));
      return;
    }
    haptic.confirm();
    toast.show({ variant: "success", label: t("settings__email_changed") });
    onDone();
  }

  return (
    <Card>
      <Card.Body className="gap-4">
        <FormError message={failure} />
        {sent === null ? (
          <>
            <Field
              label={t("settings__email_new")}
              description={t("settings__email_hint")}
              value={email}
              onChangeText={setEmail}
              placeholder={t("auth__email_placeholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="emailAddress"
              returnKeyType="send"
              autoFocus
              onSubmitEditing={() => void send()}
            />
            <Button variant="secondary" isDisabled={busy || !valid} onPress={() => void send()}>
              {busy ? <Spinner size="sm" /> : null}
              <Button.Label>{t("auth__send_code")}</Button.Label>
            </Button>
          </>
        ) : (
          <>
            <Text className="text-body text-muted">
              {t("settings__email_code_hint", { email: sent })}
            </Text>
            <OtpInput
              value={code}
              onChangeText={(next) => {
                setCode(next);
                if (failure) setFailure(null);
              }}
              onComplete={(otp) => void confirm(otp)}
              error={failure !== null}
              disabled={busy}
              autoFocus
              accessibilityLabel={t("auth__code_label")}
            />
          </>
        )}
        <Button variant="ghost" isDisabled={busy} onPress={onDone}>
          <Button.Label>{t("common__cancel")}</Button.Label>
        </Button>
      </Card.Body>
    </Card>
  );
}
