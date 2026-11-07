import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { TURNSTILE_ACTION, TURNSTILE_TOKEN_HEADER } from "@workspace/shared";
import { useCallback, useRef, useState } from "react";

import { env } from "@/platform/env";

/**
 * The Turnstile widget, shown only when a site key is configured. The token is
 * single-use, so call `reset` after every attempt.
 */
export function useTurnstile() {
  const siteKey = env.VITE_TURNSTILE_SITE_KEY;
  const ref = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState<string | null>(null);

  const reset = useCallback(() => {
    setToken(null);
    ref.current?.reset();
  }, []);

  const widget = siteKey ? (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      options={{ action: TURNSTILE_ACTION, theme: "auto" }}
      onSuccess={setToken}
      onExpire={() => setToken(null)}
      onError={() => setToken(null)}
    />
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
