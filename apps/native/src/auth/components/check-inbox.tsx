import { Spinner } from "heroui-native";
import { useState } from "react";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";

import { AuthLayout } from "./auth-layout";
import { AuthLink } from "./auth-link";
import { Button } from "@/platform/ui/button";

/** Shown after sign-up: the verification link is in the mail. */
export function CheckInbox({ email }: { email: string }) {
  const { t } = useTranslation();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  return (
    <AuthLayout
      title={t("auth__verify_title")}
      description={t("auth__verify_body", { email })}
      footer={<AuthLink href="/sign-in">{t("auth__back_to_sign_in")}</AuthLink>}
    >
      <Button
        variant="secondary"
        isDisabled={sending || resent}
        onPress={async () => {
          setSending(true);
          // The answer never says whether the address is registered.
          await authClient.sendVerificationEmail({ email, callbackURL: "/" });
          setSending(false);
          setResent(true);
        }}
      >
        {sending ? <Spinner size="sm" /> : null}
        <Button.Label>{resent ? t("auth__verify_resent") : t("auth__verify_resend")}</Button.Label>
      </Button>
    </AuthLayout>
  );
}
