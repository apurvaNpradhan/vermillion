import { logFailure, runLoggedJob } from "@workspace/logger";
import type { JobResult, PgBoss, QueuePolicy } from "pg-boss";
import { z } from "zod";

import type { Services } from "../services";

export type JobContext = {
  services: Services;
  /** Failures so far; 0 on the first attempt. */
  retryCount: number;
  retryLimit: number;
  isFinalAttempt: boolean;
};

type QueueSettings = {
  policy?: QueuePolicy;
  retryLimit?: number;
  /** Seconds before the first retry. */
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
};

/** Settings every queue shares unless it says otherwise. Tests shorten the delays. */
export type QueueDefaults = Required<
  Pick<QueueSettings, "retryLimit" | "retryDelay" | "retryBackoff">
> & {
  pollingIntervalSeconds: number;
};

export const DEFAULT_QUEUE_SETTINGS: QueueDefaults = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  pollingIntervalSeconds: 2,
};

// Payloads hold no content beyond what a retry needs, so finished jobs are cheap to keep for inspection.
const KEEP_FINISHED_SECONDS = 7 * 24 * 60 * 60;

type QueueDefinition<T extends object> = QueueSettings & {
  /** Unique queue name, `feature.action`. */
  name: string;
  /** Payloads are validated on enqueue and again before the handler runs. */
  schema: z.ZodType<T>;
  /**
   * Throw to retry. Return to finish: a permanent failure, or a job whose
   * subject no longer exists, is not worth another attempt.
   */
  handler(data: T, context: JobContext): Promise<void>;
  /** Cron expression for a recurring job (UTC). The job is sent with an empty payload. */
  cron?: string;
  /** Fields safe to log when the last attempt fails; defaults to none. */
  describe?(data: T): Record<string, string>;
};

/** What the job runtime needs from any queue, whatever its payload. */
export type AnyQueue = {
  readonly name: string;
  /** Creates the queue and starts its worker. */
  work(boss: PgBoss, services: Services, defaults: QueueDefaults): Promise<void>;
};

export type Queue<T extends object = object> = AnyQueue & {
  /** Validates and sends one job. */
  send(
    boss: PgBoss,
    data: T,
    defaults: QueueDefaults,
    options?: { singletonKey?: string },
  ): Promise<void>;
};

export function defineQueue<T extends object>(definition: QueueDefinition<T>): Queue<T> {
  const { name, schema, handler, describe, cron, ...overrides } = definition;
  const created = new WeakMap<PgBoss, Promise<void>>();
  const ensureQueue = (boss: PgBoss, defaults: QueueDefaults) => {
    let promise = created.get(boss);
    if (!promise) {
      promise = boss.createQueue(name, {
        policy: "standard",
        deleteAfterSeconds: KEEP_FINISHED_SECONDS,
        retryLimit: defaults.retryLimit,
        retryDelay: defaults.retryDelay,
        retryBackoff: defaults.retryBackoff,
        ...overrides,
      });
      created.set(boss, promise);
      promise.catch(() => created.delete(boss));
    }
    return promise;
  };

  return {
    name,
    async send(boss, data, defaults, options = {}) {
      await ensureQueue(boss, defaults);
      await boss.send(name, schema.parse(data), { singletonKey: options.singletonKey });
    },
    async work(boss, services, defaults) {
      await ensureQueue(boss, defaults);
      // Idempotent upsert, so every boot and every replica may call it.
      if (cron) await boss.schedule(name, cron, {});
      // Per-job results stop one failure from re-running its siblings in a batch.
      await boss.work(
        name,
        {
          includeMetadata: true,
          perJobResults: true,
          batchSize: 10,
          pollingIntervalSeconds: defaults.pollingIntervalSeconds,
        },
        (jobs) =>
          Promise.all(
            jobs.map(async (job): Promise<JobResult> => {
              const parsed = schema.safeParse(job.data);
              if (!parsed.success) {
                // Retrying cannot repair a payload that fails its schema.
                logFailure("jobs.invalid-payload", { queue: name });
                return { id: job.id, status: "completed" };
              }
              const context: JobContext = {
                services,
                retryCount: job.retryCount,
                retryLimit: job.retryLimit,
                isFinalAttempt: job.retryCount >= job.retryLimit,
              };
              try {
                await runLoggedJob(name, () => handler(parsed.data, context));
                return { id: job.id, status: "completed" };
              } catch (error) {
                if (context.isFinalAttempt) {
                  // Provider errors can carry addresses or tokens: only the name and code are logged.
                  reportFinalFailure(name, describe?.(parsed.data), {
                    name: error instanceof Error ? error.name : undefined,
                    code:
                      error instanceof Error && "code" in error
                        ? z.string().safeParse(error.code).data
                        : undefined,
                  });
                }
                return { id: job.id, status: "failed" };
              }
            }),
          ),
      );
    },
  };
}

function reportFinalFailure(
  queue: string,
  fields: Record<string, string> | undefined,
  failure: { name: string | undefined; code: string | undefined },
) {
  logFailure("jobs.exhausted", { queue, ...fields, errorName: failure.name, code: failure.code });
}
