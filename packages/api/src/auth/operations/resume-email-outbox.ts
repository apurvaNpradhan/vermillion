import { sql } from "drizzle-orm";
import type { Services } from "../../platform/services";
import { authEmailOutbox } from "../tables";
import { sendEmailQueue } from "./send-email";

/** Recovers legacy migrated emails and inserts whose enqueue was interrupted by a restart. */
export async function resumeEmailOutbox(services: Services) {
  // Upgrade content-format jobs only once the old process is stopped (see runbook).
  // Schema migrations stay additive; queue-format conversion belongs to the new runtime.
  await services.db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into auth_email_outbox (id, user_id, payload, expires_at)
      select j.id, j.data->>'userId', j.data, j.created_on + interval '1 hour'
      from pgboss.job j join "user" u on u.id = j.data->>'userId'
      where j.name = 'auth.send-email' and j.data ? 'kind'
        and j.state in ('created', 'retry', 'active')
      on conflict do nothing
    `);
    await tx.execute(sql`
      update pgboss.job set data = jsonb_build_object('emailId', id)
      where name = 'auth.send-email' and data ? 'kind'
    `);
  });
  const rows = await services.db.select({ id: authEmailOutbox.id }).from(authEmailOutbox);
  for (const row of rows)
    await services.jobs.enqueue(sendEmailQueue, { emailId: row.id }, { singletonKey: row.id });
}
