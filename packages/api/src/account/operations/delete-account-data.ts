import { logFailure } from "@workspace/logger";

import { purgeUserData } from "../../platform/user-data";
import type { Services } from "../../platform/services";
import { accountCleanupQueue } from "./account-cleanup";

/**
 * Runs before Better Auth deletes a user (self-service or admin). Rows that
 * cascade from the user go with the user row; everything else is purged here,
 * and a cleanup job repeats the purge so a failure now cannot leave orphans.
 * If the job cannot even be queued the deletion is refused, so the user retries.
 */
export async function deleteAccountData(services: Services, userId: string) {
  try {
    await purgeUserData(services.db, userId);
  } catch {
    // The cleanup job retries it.
    logFailure("account.purge", { userId });
  }
  await services.jobs.enqueue(accountCleanupQueue, { userId });
}
