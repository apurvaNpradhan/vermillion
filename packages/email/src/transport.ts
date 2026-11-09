import { log } from "@workspace/logger";
import { Resend } from "resend";

import type { RenderedEmail } from "./types";

/** The network boundary for outgoing mail. Swap providers by editing this module. */
export type EmailTransport = {
  send(email: RenderedEmail): Promise<void>;
};

export type EmailTransportConfig = {
  resendApiKey?: string | undefined;
  from?: string | undefined;
  /** Log emails instead of sending, even in production (throwaway stacks). */
  consoleOnly?: boolean | undefined;
  isProduction: boolean;
};

/** First line format is stable so tests can parse the code or link out of the log. */
export const LOG_EMAIL_MARKER = "[email]";

/** Development transport: prints the plain-text email to the server log. */
export function createLogTransport(): EmailTransport {
  return {
    async send(email) {
      // Subject and body can carry a sign-in code or a link, so the structured log only says that
      // a message was logged; the readable marker line below is the development convenience.
      log.info({
        action: "email.logged",
        to: email.to,
      });
      console.info(
        `${LOG_EMAIL_MARKER} to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`,
      );
    },
  };
}

/** Provider errors can echo addresses or content, so only name and status leave this module. */
function describeError(error: { name?: string; statusCode?: number | null }) {
  return Object.assign(new Error("Email provider rejected the message"), {
    name: error.name ?? "EMAIL_PROVIDER_ERROR",
    statusCode: error.statusCode ?? undefined,
  });
}

export function createEmailTransport(config: EmailTransportConfig): EmailTransport {
  if (!config.resendApiKey || config.consoleOnly) {
    // Production must opt in explicitly, so a missing API key can never leak
    // links into production logs.
    if (config.isProduction && !config.consoleOnly) {
      throw new Error("RESEND_API_KEY is required in production (or set EMAIL_CONSOLE=true)");
    }
    return createLogTransport();
  }
  const { from } = config;
  if (!from) throw new Error("EMAIL_FROM is required when RESEND_API_KEY is set");
  const resend = new Resend(config.resendApiKey);
  return {
    async send(email) {
      const { error } = await resend.emails.send({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (error) throw describeError(error);
    },
  };
}
