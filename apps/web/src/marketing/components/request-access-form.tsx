import { Turnstile } from "@marsidev/react-turnstile";
import { errorMessageKey } from "@workspace/client/orpc-error";
import { TURNSTILE_ACTION } from "@workspace/shared";
import { useState } from "react";

import { env } from "@/platform/env";
import { useT } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";

import { useRequestAccess } from "../use-request-access";

/** Email plus Turnstile (only here). The confirmation reads the same for every address. */
export function RequestAccessForm() {
  const t = useT();
  const { request, pending, sent, error } = useRequestAccess();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | undefined>();
  const siteKey = env.VITE_TURNSTILE_SITE_KEY;

  if (sent) {
    return (
      <p role="status" className="rounded-xl bg-surface p-4 text-text-primary">
        {t("site__request_sent")}
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void request({ email: email.trim(), ...(token ? { turnstileToken: token } : {}) }).catch(
          () => undefined,
        );
      }}
    >
      <label htmlFor="request-email" className="text-sm font-medium text-text-primary">
        {t("site__request_label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="request-email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("site__request_placeholder")}
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <Button type="submit" disabled={pending || (Boolean(siteKey) && !token)} loading={pending}>
          {t("site__request_action")}
        </Button>
      </div>
      {siteKey ? (
        <Turnstile
          siteKey={siteKey}
          options={{ action: TURNSTILE_ACTION, size: "flexible" }}
          onSuccess={setToken}
          onExpire={() => setToken(undefined)}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {t(errorMessageKey(error))}
        </p>
      ) : null}
      <p className="text-sm text-text-muted">{t("site__request_hint")}</p>
    </form>
  );
}
