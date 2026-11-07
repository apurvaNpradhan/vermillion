import { accountCleanupQueue } from "../../account/index";
import { sendEmailQueue } from "../../auth/index";
import { syncPurgeQueue } from "../sync/purge";
import { slotLagQueue } from "../sync/slot-lag";
import type { AnyQueue } from "./define-queue";

/** One of the static lists a vertical joins the app through: every queue with a worker. */
export const queues: readonly AnyQueue[] = [
  sendEmailQueue,
  accountCleanupQueue,
  slotLagQueue,
  syncPurgeQueue,
];
