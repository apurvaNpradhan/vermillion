import { addBreadcrumb } from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { authErrorKey } from "@workspace/client/auth-error";
import { Chip, Spinner } from "heroui-native";
import { GoogleLogo } from "phosphor-react-native";
import { useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";

import { signInWithGoogle } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { FormError } from "@/platform/ui/form-error";

import { readLastLoginMethod, rememberLoginMethod } from "../last-login-method";
import { refreshSession } from "../session";

type GoogleAttempt = { controller: AbortController; retryable: boolean };

function breadcrumb(message: "start" | "returned" | "cancelled" | "error" | "success") {
  addBreadcrumb({ category: "auth.google", message });
}

/** Opens Google sign-in and refreshes the app session once the browser callback is saved. */
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

  const owner = useRef<GoogleAttempt | null>(null);
  useLayoutEffect(
    () => () => {
      const attempt = owner.current;
      owner.current = null;
      attempt?.controller.abort();
    },
    [],
  );

  async function signIn() {
    const previous = owner.current;
    if (disabled || (previous && !previous.retryable)) return;
    const attempt = { controller: new AbortController(), retryable: false };
    owner.current = attempt;
    previous?.controller.abort();
    setPending(true);
    setFailure(null);

    try {
      breadcrumb("start");
      const result = await signInWithGoogle(attempt.controller.signal, (retryable) => {
        if (owner.current !== attempt) return;
        attempt.retryable = retryable;
        setPending(!retryable);
        if (retryable) breadcrumb("returned");
      });
      if (owner.current !== attempt) return;
      if (result.error) {
        breadcrumb("error");
        setFailure(t(authErrorKey(result.error)));
      } else if (result.signedIn) {
        breadcrumb("success");
        rememberLoginMethod("google");
        await refreshSession(queryClient);
      } else {
        breadcrumb("cancelled");
      }
    } catch {
      if (owner.current !== attempt) return;
      breadcrumb("error");
      setFailure(t("auth__error_unknown"));
    } finally {
      if (owner.current === attempt) {
        owner.current = null;
        setPending(false);
      }
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
