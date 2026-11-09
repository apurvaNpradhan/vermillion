import { z } from "zod";
import { authEmailSchema } from "@workspace/auth";
import { OTP_EXPIRY_SECONDS } from "@workspace/shared";
import { sendEmail, type EmailInput } from "@workspace/email";
import { eq } from "drizzle-orm";
import { user } from "@workspace/db/schema/auth";

import { defineQueue } from "../../platform/jobs/index";
import { getSavedLocale } from "../../preferences/index";
import { authEmailOutbox } from "../tables";

/**
 * Sends one security email. Runs as a job so a provider outage retries instead
 * of losing the message, and so no request waits on the provider.
 */
export const sendEmailQueue = defineQueue({
  // A new queue name prevents old rolling-deploy workers from consuming the ID-only format.
  name: "auth.deliver-email",
  policy: "exclusive",
  schema: z.object({ emailId: z.uuid() }),
  handler: async ({ emailId }, { services, isFinalAttempt }) => {
    const [entry] = await services.db
      .select()
      .from(authEmailOutbox)
      .where(eq(authEmailOutbox.id, emailId))
      .limit(1);
    if (!entry) return;
    const remove = () => services.db.delete(authEmailOutbox).where(eq(authEmailOutbox.id, emailId));
    const job = authEmailSchema.parse(entry.payload);
    // Also protect code rows queued before their outbox TTL was shortened.
    const codeExpired =
      (job.kind === "sign-in-code" || job.kind === "change-email-code") &&
      Date.parse(job.request.requestedAt) + OTP_EXPIRY_SECONDS * 1000 <= Date.now();
    if (entry.expiresAt <= new Date() || codeExpired) {
      await remove();
      return;
    }
    const recipient = job.userId
      ? (await services.db.select().from(user).where(eq(user.id, job.userId)).limit(1))[0]
      : undefined;
    // Deleted since it was queued: nothing to send, nothing to retry.
    if (job.userId && !recipient) {
      await remove();
      return;
    }
    const locale =
      (recipient ? await getSavedLocale(services.db, recipient.id) : null) ??
      job.request.localeHint;
    const device = {
      ip: job.request.ip,
      browser: job.request.browser,
      os: job.request.os,
      requestedAt: job.request.requestedAt,
    };
    const common = {
      name: recipient?.name ?? "",
      locale,
      appName: services.config.appName,
      request: device,
    };
    // The code kinds carry their own address; the rest go to the account's current one.
    const account = recipient?.email ?? "";
    let email: EmailInput;
    switch (job.kind) {
      case "sign-in-code":
        email = {
          ...common,
          to: job.to,
          template: "sign-in-code",
          otp: job.otp,
          existingAccount: Boolean(recipient),
        };
        break;
      case "change-email-code":
        email = { ...common, to: job.to, template: "change-email-code", otp: job.otp };
        break;
      case "sign-in-notice":
        email = { ...common, to: account, template: "sign-in-notice" };
        break;
      case "security-notice":
        email = { ...common, to: job.to ?? account, template: "security-notice" };
        break;
      case "delete-account":
        email = { ...common, to: account, template: "delete-account", url: job.url };
        break;
    }
    try {
      await sendEmail(services.emailTransport, email);
      await remove();
    } catch (error) {
      if (isFinalAttempt) await remove();
      throw error;
    }
  },
  describe: (job) => ({ emailId: job.emailId }),
});
