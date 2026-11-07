/**
 * Counts local writes in flight so a service worker update never activates under one (ADR 0020).
 * Module hooks wrap each write: `await trackWrite(db.writeTransaction(...))`. Tabs hold separate
 * gates, which is enough: activation reloads only the tab that asked for it.
 */
let inFlight = 0;
const idleWaiters = new Set<() => void>();

export async function trackWrite<T>(write: Promise<T>): Promise<T> {
  inFlight += 1;
  try {
    return await write;
  } finally {
    inFlight -= 1;
    if (inFlight === 0) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  }
}

/** Resolves once no tracked write is in flight (immediately when none is). */
export function whenWritesIdle(): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.add(resolve));
}
