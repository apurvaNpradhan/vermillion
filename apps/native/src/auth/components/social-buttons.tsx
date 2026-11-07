import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";

import { refreshSession } from "../session";
import { authErrorKey } from "@workspace/client/auth-error";
import { FormError } from "@/platform/ui/form-error";
import { readLastLoginMethod, rememberLoginMethod } from "../last-login-method";
import { useRegistrationStatus } from "../use-registration-status";

const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];

/** One button per social provider the server has configured; nothing when none is. */
export function SocialButtons({
  headers,
  blocked,
  onDone,
}: {
  headers: Record<string, string>;
  /** True while a required CAPTCHA is unsolved. */
  blocked: boolean;
  /** Called once the provider flow has finished (the token is spent either way). */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useRegistrationStatus();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);
  const enabled = PROVIDERS.filter((provider) => status?.providers[provider]);
  if (enabled.length === 0) return null;
  const lastUsed = readLastLoginMethod();

  return (
    <View className="gap-2">
      <FormError message={failure} />
      <Text className="text-center text-muted text-xs">{t("auth__continue_with")}</Text>
      {enabled.map((provider) => (
        <Button
          key={provider}
          variant="secondary"
          isDisabled={blocked || pending !== null}
          onPress={async () => {
            setPending(provider);
            setFailure(null);
            // The expo plugin opens the system browser and turns the relative callback into a deep link.
            try {
              const { error } = await authClient.signIn.social(
                { provider, callbackURL: "/" },
                { headers },
              );
              if (error) {
                setFailure(t(authErrorKey(error)));
                return;
              }
              // Record only a completed login, not a cancelled browser/provider flow.
              const session = await refreshSession(queryClient);
              if (session) rememberLoginMethod(provider);
            } catch {
              setFailure(t("auth__error_unknown"));
            } finally {
              setPending(null);
              onDone();
            }
          }}
        >
          <Button.Label>
            {t(provider === "google" ? "auth__provider_google" : "auth__provider_github")}
          </Button.Label>
          {lastUsed === provider ? (
            <Chip size="sm" variant="secondary">
              <Chip.Label>{t("auth__last_used")}</Chip.Label>
            </Chip>
          ) : null}
        </Button>
      ))}
    </View>
  );
}
