import { runServer, thresholdsFromMegabytes, type ApiConfig } from "@workspace/api";
import { createEmailTransport } from "@workspace/email";
import { initLogger } from "@workspace/logger";
import { createFsDrain } from "evlog/fs";

import { appConfig } from "../../../app.config";
import { env } from "@workspace/env/server";

initLogger({ env: { service: `${appConfig.name}-server` } });

const credentials = (clientId?: string, clientSecret?: string) =>
  clientId && clientSecret ? { clientId, clientSecret } : undefined;

const isProduction = env.NODE_ENV === "production";

const config: ApiConfig = {
  appName: appConfig.displayName,
  appVersion: appConfig.version,
  appUrl: env.APP_URL,
  appScheme: appConfig.scheme,
  nativePort: appConfig.ports.native,
  isProduction,
  authSecret: env.BETTER_AUTH_SECRET,
  trustedProxies: env.TRUSTED_PROXIES,
  registrationOpen: env.REGISTRATION_OPEN,
  adminEmails: env.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  turnstileSecret: env.TURNSTILE_SECRET_KEY,
  google: credentials(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
  github: credentials(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
  openApiReference: !isProduction,
  sync: {
    slotLag: thresholdsFromMegabytes(env.SYNC_SLOT_LAG_WARN_MB, env.SYNC_SLOT_LAG_CRITICAL_MB),
  },
};

await runServer({
  config,
  databaseUrl: env.DATABASE_URL,
  port: appConfig.ports.server,
  emailTransport: createEmailTransport({
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    consoleOnly: env.EMAIL_CONSOLE,
    isProduction,
  }),
  app: { drain: isProduction ? undefined : createFsDrain() },
});
