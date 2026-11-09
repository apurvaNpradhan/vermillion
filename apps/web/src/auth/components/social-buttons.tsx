import { authErrorKey } from "@workspace/client/auth-error";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";
import { safeReturnLocation } from "@/platform/navigation";

import { FormError } from "./form-error";
import { useRegistrationStatus } from "../use-registration-status";

const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];

/** One button per social provider the server has configured; nothing when none is. */
export function SocialButtons({
  redirect,
  headers,
  blocked,
  onDone,
}: {
  redirect: string | undefined;
  headers: Record<string, string>;
  /** True while a required CAPTCHA is unsolved. */
  blocked: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const status = useRegistrationStatus();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);
  const enabled = PROVIDERS.filter((provider) => status?.providers[provider]);
  if (enabled.length === 0) return null;
  const lastUsed = authClient.getLastUsedLoginMethod();
  const returnTo = safeReturnLocation(redirect);

  return (
    <div className="flex flex-col gap-2">
      <FormError message={failure} />
      <p className="text-center text-caption text-muted-foreground">{t("auth__continue_with")}</p>
      {enabled.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          disabled={blocked || pending !== null}
          loading={pending === provider}
          onClick={async () => {
            setPending(provider);
            setFailure(null);
            try {
              const { error } = await authClient.signIn.social(
                { provider, callbackURL: returnTo, errorCallbackURL: "/login" },
                { headers },
              );
              if (error) setFailure(t(authErrorKey(error)));
            } catch {
              setFailure(t("auth__error_unknown"));
            } finally {
              setPending(null);
              onDone();
            }
          }}
        >
          {t(provider === "google" ? "auth__provider_google" : "auth__provider_github")}
          {lastUsed === provider ? <Badge variant="outline">{t("auth__last_used")}</Badge> : null}
        </Button>
      ))}
    </div>
  );
}
