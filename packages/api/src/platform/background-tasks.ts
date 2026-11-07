import { logFailure } from "@workspace/logger";

/**
 * Work that must not delay a response (queueing an email, for instance, so the
 * answer takes the same time for every address). Pending work is drained, with
 * a bound, on shutdown so a redeploy doesn't drop it.
 */
export function createBackgroundTasks() {
  const pending = new Set<Promise<void>>();

  return {
    run(promise: Promise<unknown>): void {
      const task: Promise<void> = Promise.resolve(promise)
        .then(() => undefined)
        .catch(() => {
          // Failures can carry addresses or tokens: log the fact, not the error.
          logFailure("background-task.failed");
        })
        .finally(() => pending.delete(task));
      pending.add(task);
    },
    /** Resolves true once nothing is pending, false when the time bound hits first. */
    async drain(timeoutMs = 10_000): Promise<boolean> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            while (pending.size > 0) await Promise.all(pending);
            return true;
          })(),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type BackgroundTasks = ReturnType<typeof createBackgroundTasks>;
