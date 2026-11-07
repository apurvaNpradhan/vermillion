import { TURNSTILE_TOKEN_HEADER } from "@workspace/shared";
import { useCallback, useState } from "react";

import { env } from "@/platform/env";

import { TurnstileWidget } from "./turnstile-widget";

/**
 * The Turnstile challenge, shown only when a site key is configured. The token
 * is single-use, so call `reset` after every attempt.
 */
export function useTurnstile() {
  const siteKey = env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setResetKey((key) => key + 1);
  }, []);

  const widget = siteKey ? (
    <TurnstileWidget siteKey={siteKey} resetKey={resetKey} onToken={setToken} />
  ) : null;

  const headers: Record<string, string> = token ? { [TURNSTILE_TOKEN_HEADER]: token } : {};

  return {
    widget,
    /** True when a challenge is configured but not yet solved. */
    pending: Boolean(siteKey) && !token,
    /** Request options carrying the token, for Better Auth client calls. */
    headers,
    reset,
  };
}
