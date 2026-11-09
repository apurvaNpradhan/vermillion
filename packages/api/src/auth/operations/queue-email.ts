import { authEmailSchema, type AuthEmail } from "@workspace/auth";
import { lt } from "drizzle-orm";
import { OTP_EXPIRY_SECONDS } from "@workspace/shared";

import type { Services } from "../../platform/services";
import { authEmailOutbox } from "../tables";
import { sendEmailQueue } from "./send-email";

/** Persist sensitive content behind a user cascade; retained pg-boss jobs carry only the outbox ID. */
export async function queueEmail(services: Services, input: AuthEmail) {
  const payload = authEmailSchema.parse(input);
  await services.db.delete(authEmailOutbox).where(lt(authEmailOutbox.expiresAt, new Date()));
  const [row] = await services.db
    .insert(authEmailOutbox)
    .values({
      userId: payload.userId ?? null,
      payload,
      // Retries must not deliver a code after its verification window has ended.
      expiresAt: new Date(
        payload.kind === "sign-in-code" || payload.kind === "change-email-code"
          ? Date.parse(payload.request.requestedAt) + OTP_EXPIRY_SECONDS * 1000
          : Date.now() + 60 * 60 * 1000,
      ),
    })
    .returning({ id: authEmailOutbox.id });
  if (!row) throw new Error("Could not create email outbox entry");
  // Leave the row available for diagnosis if durable enqueue fails; expiry/deletion still apply.
  await services.jobs.enqueue(sendEmailQueue, { emailId: row.id }, { singletonKey: row.id });
}
