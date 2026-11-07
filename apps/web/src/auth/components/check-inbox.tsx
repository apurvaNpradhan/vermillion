import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";

import { AuthLayout } from "./auth-layout";

/** Shown after sign-up: the verification link is in the mail. */
export function CheckInbox({ email, callbackURL }: { email: string; callbackURL: string }) {
  const { t } = useTranslation();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  return (
    <AuthLayout title={t("auth__verify_title")} description={t("auth__verify_body", { email })}>
      <Button
        variant="outline"
        loading={sending}
        disabled={resent}
        onClick={async () => {
          setSending(true);
          // The answer never says whether the address is registered.
          await authClient.sendVerificationEmail({ email, callbackURL });
          setSending(false);
          setResent(true);
        }}
      >
        {resent ? t("auth__verify_resent") : t("auth__verify_resend")}
      </Button>
      <Link to="/login" className="text-center text-muted-foreground text-sm underline">
        {t("auth__back_to_sign_in")}
      </Link>
    </AuthLayout>
  );
}
