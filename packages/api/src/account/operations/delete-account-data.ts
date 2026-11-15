import { logFailure } from "@workspace/logger";
import { MEDIA_FINAL_PURGE_DELAY_SECONDS } from "@workspace/shared";

import { purgeUserData, retireUserData } from "../../platform/user-data";
import type { Services } from "../../platform/services";
import { accountCleanupQueue } from "./account-cleanup";
import { accountFinalPurgeQueue } from "./account-final-purge";

/**
 * Runs before Better Auth deletes a user (self-service or admin). Rows that
 * cascade from the user go with the user row; everything else is purged here,
 * and a cleanup job repeats the purge so a failure now cannot leave orphans.
 * A second, delayed purge catches what a URL signed before the deletion uploads afterwards.
 * If a job cannot even be queued the deletion is refused, so the user retries.
 */
export async function deleteAccountData(services: Services, userId: string) {
  // First, so nothing new (a signed URL) starts while the data goes. A failure refuses the deletion.
  await retireUserData(services, userId);
  try {
    await purgeUserData(services, userId);
  } catch {
    // The cleanup job retries it.
    logFailure("account.purge", { userId });
  }
  await services.jobs.enqueue(accountCleanupQueue, { userId });
  await services.jobs.enqueue(
    accountFinalPurgeQueue,
    { userId },
    { startAfterSeconds: MEDIA_FINAL_PURGE_DELAY_SECONDS },
  );
}
