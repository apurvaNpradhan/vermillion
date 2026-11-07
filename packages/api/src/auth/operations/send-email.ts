import { z } from "zod";
import { authEmailSchema } from "@workspace/auth";
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
    if (entry.expiresAt <= new Date()) {
      await remove();
      return;
    }
    const job = authEmailSchema.parse(entry.payload);
    const [recipient] = await services.db
      .select()
      .from(user)
      .where(eq(user.id, job.userId))
      .limit(1);
    // Deleted since it was queued: nothing to send, nothing to retry.
    if (!recipient) {
      await remove();
      return;
    }
    const locale = (await getSavedLocale(services.db, recipient.id)) ?? job.request.localeHint;
    const device = {
      ip: job.request.ip,
      browser: job.request.browser,
      os: job.request.os,
      requestedAt: job.request.requestedAt,
    };
    const common = {
      to: job.kind === "verification" ? job.to : recipient.email,
      name: recipient.name,
      locale,
      appName: services.config.appName,
      request: device,
    };
    let email: EmailInput;
    switch (job.kind) {
      case "sign-in-notice":
        email = { ...common, template: "sign-in-notice" };
        break;
      case "security-notice":
        email = { ...common, template: "security-notice" };
        break;
      case "verification":
        email = { ...common, template: "verification", url: job.url };
        break;
      case "reset-password":
        email = { ...common, template: "reset-password", url: job.url };
        break;
      case "change-email":
        email = { ...common, template: "change-email", url: job.url, newEmail: job.newEmail };
        break;
      case "delete-account":
        email = { ...common, template: "delete-account", url: job.url };
        break;
      case "existing-account":
        email = { ...common, template: "existing-account", url: job.url };
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
