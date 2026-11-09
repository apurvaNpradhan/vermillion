import { useQueryClient } from "@tanstack/react-query";
import { Chip, useThemeColor } from "heroui-native";
import { GithubLogo, GoogleLogo } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";

import { refreshSession } from "../session";
import { authErrorKey } from "@workspace/client/auth-error";
import { FormError } from "@/platform/ui/form-error";
import { readLastLoginMethod, rememberLoginMethod } from "../last-login-method";
import { useRegistrationStatus } from "../use-registration-status";
import { Button } from "@/platform/ui/button";

const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];
const PROVIDER_ICONS = { google: GoogleLogo, github: GithubLogo } as const;

/**
 * One secondary button per social provider the server has configured; nothing when none is.
 * Where the screen's one primary action is "Continue with email", they stay secondary.
 */
export function SocialButtons({
  headers,
  blocked,
  onDone,
  pill = false,
}: {
  headers: Record<string, string>;
  /** True while a required CAPTCHA is unsolved. */
  blocked: boolean;
  /** Called once the provider flow has finished (the token is spent either way). */
  onDone: () => void;
  /** Full-width dark primary pills (the welcome screen) instead of secondary buttons. */
  pill?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useRegistrationStatus();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);
  const [foreground, onAccent] = useThemeColor(["foreground", "accent-foreground"]);
  const enabled = PROVIDERS.filter((provider) => status?.providers[provider]);
  if (enabled.length === 0) return null;
  const lastUsed = readLastLoginMethod();

  return (
    <View className="gap-3">
      <FormError message={failure} />
      {enabled.map((provider) => {
        const Icon = PROVIDER_ICONS[provider];
        return (
          <Button
            key={provider}
            variant={pill ? "primary" : "secondary"}
            className={pill ? "h-14 rounded-full" : "h-13 rounded-xl"}
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
            <Icon size={18} color={pill ? onAccent : foreground} weight="bold" />
            <Button.Label className={pill ? "text-body-lg font-semibold" : undefined}>
              {t(provider === "google" ? "auth__provider_google" : "auth__provider_github")}
            </Button.Label>
            {lastUsed === provider ? (
              <Chip size="sm" variant="secondary">
                <Chip.Label>{t("auth__last_used")}</Chip.Label>
              </Chip>
            ) : null}
          </Button>
        );
      })}
    </View>
  );
}
