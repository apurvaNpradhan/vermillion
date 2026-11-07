type WaitForDatabaseOptions<T> = {
  query: () => Promise<T>;
  sleep?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

/** Retries a trivial query until the database answers, so the app can start before Postgres does. */
export async function waitForDatabase<T>({
  query,
  sleep = defaultSleep,
  maxAttempts = 30,
  retryDelayMs = 1_000,
}: WaitForDatabaseOptions<T>): Promise<void> {
  if (maxAttempts < 1) throw new RangeError(`maxAttempts must be at least 1, got ${maxAttempts}`);
  if (retryDelayMs < 0) {
    throw new RangeError(`retryDelayMs must be non-negative, got ${retryDelayMs}`);
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await query();
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await sleep(retryDelayMs);
    }
  }
}
