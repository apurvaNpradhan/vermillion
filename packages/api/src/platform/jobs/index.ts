import { setTimeout as delay } from "node:timers/promises";
import { logFailure } from "@workspace/logger";
import { PgBoss, type ConstructorOptions } from "pg-boss";
import { z } from "zod";

import type { Services } from "../services";
import {
  DEFAULT_QUEUE_SETTINGS,
  type AnyQueue,
  type Queue,
  type QueueDefaults,
} from "./define-queue";

export { defineQueue, type JobContext, type Queue } from "./define-queue";

export type JobsOptions = {
  /** pg-boss connection: a `connectionString` in production, the cloned test database in tests. */
  boss: ConstructorOptions;
  queues: readonly AnyQueue[];
  defaults?: Partial<QueueDefaults>;
};

/**
 * Postgres-backed jobs running inside the server process. Queues are defined
 * by name, payload schema, handler and retry settings; payloads carry ids
 * rather than content wherever a handler can look the content up.
 */
export function createJobs(options: JobsOptions) {
  const defaults: QueueDefaults = { ...DEFAULT_QUEUE_SETTINGS, ...options.defaults };
  let boss: PgBoss | undefined;
  let starting: Promise<PgBoss> | undefined;
  let stopped = false;

  function connect(): Promise<PgBoss> {
    if (stopped) return Promise.reject(new Error("Jobs are stopped"));
    starting ??= (async () => {
      const instance = new PgBoss({ schema: "pgboss", ...options.boss });
      instance.on("error", () => logFailure("jobs.boss"));
      await instance.start();
      boss = instance;
      return instance;
    })();
    starting.catch(() => {
      starting = undefined;
    });
    return starting;
  }

  return {
    /** Sends a job. Starts the connection on first use; never after `stop`. */
    async enqueue<T extends object>(
      queue: Queue<T>,
      data: T,
      sendOptions?: { singletonKey?: string },
    ) {
      await queue.send(await connect(), data, defaults, sendOptions);
    },
    /** Starts pg-boss and a worker for every queue. */
    async start(services: Services) {
      const instance = await connect();
      for (const queue of options.queues) await queue.work(instance, services, defaults);
    },
    /** Keeps workers alive until queued/in-flight work finishes or the deadline expires. */
    async drain(queueNames: readonly string[], timeoutMs: number): Promise<boolean> {
      if (!boss) return true;
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        // Queue summaries are monitor snapshots; shutdown must inspect live rows.
        const { rows } = await boss
          .getDb()
          .executeSql(
            "select exists(select 1 from pgboss.job where name = any($1::text[]) and state <= 'active') as pending",
            [[...queueNames]],
          );
        if (!z.object({ pending: z.boolean() }).parse(rows[0]).pending) return true;
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        await delay(Math.min(50, remaining));
      }
    },
    /** Stops workers gracefully (in-flight jobs finish, within the time bound) and closes the pool. */
    async stop(timeoutMs = 10_000) {
      stopped = true;
      const pending = starting;
      starting = undefined;
      await pending?.catch(() => undefined);
      await boss?.stop({ graceful: true, timeout: timeoutMs, close: true });
      boss = undefined;
    },
  };
}

export type Jobs = ReturnType<typeof createJobs>;
