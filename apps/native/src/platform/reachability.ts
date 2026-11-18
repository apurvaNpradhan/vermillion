/** How long an explicit tap waits for a fresh reachability answer before it believes "offline". */
export const REACHABILITY_TIMEOUT_MS = 4000;

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<{ status: number }>;

/**
 * One bounded request to our own liveness route (the same probe NetInfo uses). True only on a 200
 * within the timeout; any failure, abort or other status is false. Never throws.
 */
export async function probeReachable(
  url: string,
  fetcher: Fetch,
  timeoutMs = REACHABILITY_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
