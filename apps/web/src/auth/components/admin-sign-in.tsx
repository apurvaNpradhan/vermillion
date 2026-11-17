import { Turnstile } from "@marsidev/react-turnstile";
import { TURNSTILE_ACTION } from "@workspace/shared";
import { useState } from "react";

import { env } from "@/platform/env";
import { useT, type SiteKey } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";
import { Label } from "@/platform/ui/label";

import { useEmailSignIn } from "../use-email-sign-in";
import { AuthCard, FormMessage } from "./auth-card";

/** Email, then the emailed code. The CAPTCHA guards sending a code, as in the app. */
export function AdminSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT();
  const { pending, sendCode, redeem } = useEmailSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<SiteKey | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const siteKey = env.VITE_TURNSTILE_SITE_KEY;

  return (
    <AuthCard
      title={t("admin__sign_in_title")}
      body={sent ? t("admin__code_sent", { email }) : t("admin__sign_in_body")}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setFailure(null);
          if (!sent) {
            const error = await sendCode(email.trim(), token);
            if (error) setFailure(error);
            else setSent(true);
            return;
          }
          const error = await redeem(email.trim(), code.trim());
          if (error) setFailure(error);
          else onSignedIn();
        }}
      >
        {sent ? (
          <>
            <Label htmlFor="admin-code">{t("admin__code_label")}</Label>
            <Input
              id="admin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
              autoFocus
            />
          </>
        ) : (
          <>
            <Label htmlFor="admin-email">{t("admin__email_label")}</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              autoFocus
            />
            {siteKey ? (
              <Turnstile
                siteKey={siteKey}
                options={{ action: TURNSTILE_ACTION, size: "flexible" }}
                onSuccess={setToken}
                onExpire={() => setToken(undefined)}
              />
            ) : null}
          </>
        )}
        <FormMessage message={failure ? t(failure) : null} />
        <Button
          type="submit"
          loading={pending}
          disabled={pending || (!sent && Boolean(siteKey) && !token)}
        >
          {sent ? t("admin__sign_in_action") : t("admin__send_code")}
        </Button>
      </form>
    </AuthCard>
  );
}
