import { authEmailSchema, type AuthEmail } from "@workspace/auth";
import { lt } from "drizzle-orm";

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
      userId: payload.userId,
      payload,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning({ id: authEmailOutbox.id });
  if (!row) throw new Error("Could not create email outbox entry");
  // Leave the row available for diagnosis if durable enqueue fails; expiry/deletion still apply.
  await services.jobs.enqueue(sendEmailQueue, { emailId: row.id }, { singletonKey: row.id });
}
