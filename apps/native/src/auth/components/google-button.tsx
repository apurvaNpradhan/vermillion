import { useQueryClient } from "@tanstack/react-query";
import { authErrorKey } from "@workspace/client/auth-error";
import { Chip, Spinner } from "heroui-native";
import { GoogleLogo } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { FormError } from "@/platform/ui/form-error";

import { readLastLoginMethod, rememberLoginMethod } from "../last-login-method";
import { refreshSession } from "../session";

/**
 * "Continue with Google": the ink-filled button of the welcome screen, shown only when the server
 * has Google configured. The Expo plugin opens the system browser and turns the relative callback
 * into a deep link; a cancelled flow records nothing.
 */
export function GoogleButton({
  glyphColor,
  disabled,
}: {
  /** The glyph's colour (the ink fill's own foreground), from the screen's scoped theme. */
  glyphColor: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (error) {
        setFailure(t(authErrorKey(error)));
        return;
      }
      // Record only a completed login, not a cancelled browser/provider flow.
      const session = await refreshSession(queryClient);
      if (session) rememberLoginMethod("google");
    } catch {
      setFailure(t("auth__error_unknown"));
    } finally {
      setPending(false);
    }
  }

  return (
    <View className="gap-3">
      <FormError message={failure} />
      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-13 rounded-full py-3"
        isDisabled={disabled === true || pending}
        accessibilityState={{ disabled: disabled === true || pending, busy: pending }}
        onPress={() => void signIn()}
      >
        {pending ? (
          <Spinner size="sm" />
        ) : (
          <GoogleLogo size={20} weight="bold" color={glyphColor} />
        )}
        <Button.Label className="shrink text-body-lg font-semibold">
          {t("auth__provider_google")}
        </Button.Label>
        {readLastLoginMethod() === "google" ? (
          <Chip size="sm" variant="secondary">
            <Chip.Label>{t("auth__last_used")}</Chip.Label>
          </Chip>
        ) : null}
      </Button>
    </View>
  );
}
