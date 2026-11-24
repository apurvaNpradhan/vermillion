import { useQueryClient } from "@tanstack/react-query";
import { authErrorKey } from "@workspace/client/auth-error";
import { log } from "@workspace/logger/client";
import * as WebBrowser from "expo-web-browser";
import { Chip, Spinner } from "heroui-native";
import { GoogleLogo } from "phosphor-react-native";
import { useState } from "react";
import { AppState, View } from "react-native";

import { authClient } from "@/platform/auth-client";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { FormError } from "@/platform/ui/form-error";

import { readLastLoginMethod, rememberLoginMethod } from "../last-login-method";
import { refreshSession } from "../session";
import { settleWithin } from "../settle";

/** The whole browser flow, from tap to a settled answer. */
const SIGN_IN_TIMEOUT_MS = 120_000;
/** The session lookup after the browser returns. */
const REFRESH_TIMEOUT_MS = 15_000;
/** After the app is back in the foreground, how long the deep link gets to finish the flow. */
const RETURN_GRACE_MS = 2_000;

/** Resolves when the app has left the foreground and then come back, plus a short grace. */
function appReturned() {
  let left = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => {};
  const returned = new Promise<void>((resolve) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        left = true;
        clearTimeout(timer);
      } else if (left) {
        timer = setTimeout(resolve, RETURN_GRACE_MS);
      }
    });
    stop = () => {
      clearTimeout(timer);
      subscription.remove();
    };
  });
  return { returned, stop };
}

/** Closes an auth session left over from a flow that never finished (a no-op elsewhere). */
function dismissLeftoverAuthSession() {
  try {
    WebBrowser.dismissAuthSession();
  } catch (error) {
    log.warn({ action: "google_dismiss_failed", name: error instanceof Error ? error.name : "?" });
  }
}

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
    dismissLeftoverAuthSession();
    const foreground = appReturned();
    try {
      log.info({ action: "google_sign_in_start" });
      const browser = await settleWithin(
        authClient.signIn.social({ provider: "google", callbackURL: "/" }),
        foreground.returned,
        SIGN_IN_TIMEOUT_MS,
      );
      if (browser.status !== "done") {
        // The flow never reported back (cancelled on Android): see whether it finished anyway.
        log.warn({ action: "google_sign_in_abandoned", reason: browser.status });
        dismissLeftoverAuthSession();
      } else if (browser.value.error) {
        log.warn({ action: "google_sign_in_error", status: browser.value.error.status });
        setFailure(t(authErrorKey(browser.value.error)));
        return;
      }
      // Record only a completed login, not a cancelled browser/provider flow.
      const lookup = await settleWithin(
        refreshSession(queryClient),
        new Promise<void>(() => {}),
        REFRESH_TIMEOUT_MS,
      );
      if (lookup.status === "done" && lookup.value) {
        log.info({ action: "google_sign_in_done" });
        rememberLoginMethod("google");
      } else {
        log.info({ action: "google_sign_in_no_session", reason: lookup.status });
      }
    } catch (error) {
      log.error({
        action: "google_sign_in_failed",
        name: error instanceof Error ? error.name : "?",
      });
      setFailure(t("auth__error_unknown"));
    } finally {
      foreground.stop();
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
